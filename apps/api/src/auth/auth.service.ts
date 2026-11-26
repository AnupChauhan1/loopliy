import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HR_ROLES } from '../common/roles';
import * as bcrypt from 'bcrypt';
import { randomBytes, createPublicKey, verify as verifySignature } from 'crypto';
import { resolveMx } from 'dns/promises';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const DEFAULT_ORG_SLUG = 'epatang-agency';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'looply-crm-2fa19';
const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let firebaseKeys: { keys: any[]; expiresAt: number } | null = null;

async function firebaseSigningKey(kid: string) {
  if (!firebaseKeys || firebaseKeys.expiresAt < Date.now() || !firebaseKeys.keys.some((k) => k.kid === kid)) {
    const res = await fetch(FIREBASE_JWKS_URL);
    if (!res.ok) return null;
    firebaseKeys = { keys: (await res.json()).keys ?? [], expiresAt: Date.now() + 60 * 60 * 1000 };
  }
  return firebaseKeys.keys.find((k) => k.kid === kid) ?? null;
}

/** Verifies a Firebase Auth ID token (signature, issuer, audience, expiry) and returns its claims. */
async function verifyFirebaseIdToken(token: string): Promise<{ email?: string; email_verified?: boolean } | null> {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) return null;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  if (header.alg !== 'RS256' || !header.kid) return null;
  if (payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
  if (!payload.sub || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  const jwk = await firebaseSigningKey(header.kid);
  if (!jwk) return null;
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(signatureB64, 'base64url'),
  );
  return valid ? payload : null;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
    private notifications: NotificationsService,
  ) {}

  /** Employee self-registration: creates an unverified, unapproved Employee
   *  account in the default workspace. Admin approval is required before
   *  login is allowed. */
  /** Step 1 of signup: generate + email a 6-digit OTP (10 min expiry). */
  async sendOtp(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address');
    // Real-time DNS MX validation — the domain must actually accept mail
    const domain = email.split('@')[1];
    try {
      await resolveMx(domain);
    } catch {
      throw new BadRequestException('This email domain cannot receive mail — please check the address');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.emailOtp.upsert({
      where: { email },
      update: { codeHash, expiresAt, attempts: 0, verifiedAt: null, verifiedToken: null },
      create: { email, codeHash, expiresAt },
    });
    // Send via SMTP when configured; if mail can't be delivered (no SMTP or send failure),
    // fall back to returning the code so signup is never blocked.
    let delivered = false;
    try {
      const result = await this.mail.sendOtp(email, code);
      delivered = result.delivered;
    } catch {
      // Mail delivery failed — fall back to one-click verify token below
    }
    if (delivered) {
      return { message: 'Verification code sent to your email', sent: true };
    }
    // No SMTP: issue a single-use cryptographic verify token instead of exposing the code.
    // The user clicks "Verify Email Now"; the token is only activated on that call.
    const linkToken = randomBytes(24).toString('hex');
    await this.prisma.emailOtp.update({
      where: { email },
      data: { verifiedToken: linkToken },
    });
    return {
      message: 'Verification required',
      sent: false,
      fallbackToken: linkToken,
    };
  }

  /** Activate a fallback verify token issued when SMTP is unavailable. */
  async verifyFallbackToken(emailRaw: string, token: string) {
    const email = emailRaw.trim().toLowerCase();
    const otp = await this.prisma.emailOtp.findUnique({ where: { email } });
    if (!otp || otp.verifiedToken !== token || otp.expiresAt < new Date()) {
      throw new BadRequestException('Verification link is invalid or expired — request a new code');
    }
    if (!otp.verifiedAt) {
      await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
    }
    return { verified: true, otpToken: otp.verifiedToken };
  }

  /** Step 2: verify the OTP; returns a one-time token required by signup. */
  async verifyOtp(emailRaw: string, code: string) {
    const email = emailRaw.trim().toLowerCase();
    const otp = await this.prisma.emailOtp.findUnique({ where: { email } });
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= 5) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    if (!(await bcrypt.compare(code.trim(), otp.codeHash))) {
      await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Incorrect verification code');
    }
    const otpToken = randomBytes(32).toString('hex');
    await this.prisma.emailOtp.update({
      where: { id: otp.id },
      data: { verifiedAt: new Date(), verifiedToken: otpToken },
    });
    return { verified: true, otpToken };
  }

  async signup(dto: SignupDto, avatarUrl?: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    // Email proof: a Firebase ID token whose email_verified claim is true
    // (covers both Google sign-in and password email-verification links)
    const fbToken = dto.firebaseIdToken || dto.googleIdToken;
    let firebaseVerified = false;
    if (fbToken) {
      try {
        const claims = await verifyFirebaseIdToken(fbToken);
        if (claims) {
          firebaseVerified = claims.email?.toLowerCase() === email && claims.email_verified === true;
        } else {
          const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(fbToken)}`);
          if (res.ok) {
            const payload: any = await res.json();
            firebaseVerified = payload.email === email && payload.email_verified === 'true';
          }
        }
      } catch {
        firebaseVerified = false;
      }
      if (!firebaseVerified) throw new BadRequestException('Email verification failed — please verify your email and try again');
    }
    const otpRecord = !firebaseVerified && dto.otpToken
      ? await this.prisma.emailOtp.findFirst({
          where: { email, verifiedToken: dto.otpToken, verifiedAt: { not: null } },
        })
      : null;
    if (!firebaseVerified && !otpRecord) {
      throw new BadRequestException('Email verification required — enter the 6-digit code sent to your email');
    }

    const org =
      (await this.prisma.organization.findUnique({ where: { slug: DEFAULT_ORG_SLUG } })) ??
      (await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })) ??
      (await this.prisma.organization.create({ data: { name: 'LOOPLY', slug: DEFAULT_ORG_SLUG } }));

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const accountType = (dto.accountType ?? 'employee').trim().toLowerCase();
    const roleName =
      accountType === 'client' ? 'Client'
      : accountType === 'hr' ? 'HR Manager'
      : accountType === 'manager' ? 'Project Manager'
      : 'Employee';

    const role = await this.prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} self-registration` },
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        organizationId: org.id,
        avatar: avatarUrl,
        emailVerified: new Date(),
        roles: { create: { roleId: role.id } },
        preferences: { create: {} },
        ...(accountType !== 'client'
          ? {
              employeeProfile: {
                create: {
                  employeeId: `EMP-${Date.now().toString(36).toUpperCase()}`,
                  phone: dto.phone,
                  employmentStatus: 'active',
                },
              },
            }
          : {}),
      },
    });

    // Client registrations also create the linked Client (portal) record
    if (accountType === 'client') {
      const existingClient = await this.prisma.client.findFirst({ where: { organizationId: org.id, email } });
      if (existingClient) {
        await this.prisma.client.update({ where: { id: existingClient.id }, data: { portalUserId: user.id } });
      } else {
        await this.prisma.client.create({
          data: {
            name: dto.companyName?.trim() || `${user.firstName} ${user.lastName}`,
            email,
            organizationId: org.id,
            portalUserId: user.id,
          },
        });
      }
    }

    // Consume the OTP challenge when one was used (Google signups have none)
    if (otpRecord) await this.prisma.emailOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});

    // Notify HR and Admin users about the new registration request
    const reviewerIds = await this.notifications.userIdsWithRoles(org.id, HR_ROLES);
    await this.notifications.notifyMany(
      reviewerIds,
      'registration_submitted',
      `New ${roleName} registration`,
      `${user.firstName} ${user.lastName} submitted a ${roleName} registration request (${email})`,
      '/employees',
    );

    return {
      message: 'Registration submitted — HR and an admin will review your account. You\'ll get an email once approved.',
      userId: user.id,
    };
  }

  async verifyEmail(email: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.emailVerifyToken !== token) throw new BadRequestException('Invalid verification link');
    if (user.emailVerifyExpiresAt && user.emailVerifyExpiresAt < new Date()) {
      throw new BadRequestException('Verification link has expired — please sign up again');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date(), emailVerifyToken: null, emailVerifyExpiresAt: null },
    });
    return {
      message: 'Email verified. Your registration is now pending HR review.',
      stage: 'pending_hr',
    };
  }

  /** Resend the email-verification link for an unverified account. */
  async resendVerification(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    // Same response whether or not the account exists (no enumeration)
    const generic = { message: 'If an unverified account exists for that email, a new verification link has been sent.' };
    if (!user || user.emailVerified || user.approvedAt) return generic;

    const verifyToken = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: verifyToken, emailVerifyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    const verifyUrl = this.mail.appUrl(`/verify-email?email=${encodeURIComponent(normalized)}&token=${verifyToken}`);
    await this.mail.send(
      normalized,
      'Verify your LOOPLY account',
      `Hi ${user.firstName},\n\nVerify your email to continue your LOOPLY registration:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    );
    return {
      ...generic,
      ...(process.env.NODE_ENV !== 'production' ? { devVerifyToken: verifyToken } : {}),
    };
  }

  async forgotPassword(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    let devResetToken: string | undefined;
    // Always return the same response to avoid account enumeration
    if (user) {
      const resetToken = randomBytes(32).toString('hex');
      devResetToken = resetToken;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const resetUrl = this.mail.appUrl(`/reset-password?token=${resetToken}`);
      await this.mail.send(
        normalized,
        'Reset your LOOPLY password',
        `Hi ${user.firstName},\n\nReset your password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      );
    }
    return {
      message: 'If an account exists for that email, a reset link has been sent.',
      ...(process.env.NODE_ENV !== 'production' && devResetToken ? { devResetToken } : {}),
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiresAt: { gt: new Date() } },
    });
    if (!user) throw new BadRequestException('Invalid or expired reset link');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });
    return { message: 'Password updated. You can now sign in.' };
  }

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName, organizationName } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create organization
    const organization = await this.prisma.organization.create({
      data: {
        name: organizationName,
        slug: organizationName.toLowerCase().replace(/\s+/g, '-'),
      },
    });

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        organizationId: organization.id,
      },
    });

    // Assign admin role
    const adminRole = await this.prisma.role.findFirst({
      where: { name: 'Super Admin' },
    });

    if (adminRole) {
      await this.prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: adminRole.id,
        },
      });
    }

    // Generate token
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      organizationId: organization.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizationId: organization.id,
      },
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        organization: true,
        roles: { include: { role: true } },
        clientProfile: { select: { id: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.completeLogin(user);
  }

  /** OAuth sign-in (Google / Zoho OIDC via Firebase): verifies the Firebase ID
   *  token, looks the user up by verified email, and applies the same
   *  approval gates as password login. */
  async loginWithFirebase(firebaseIdToken: string) {
    const claims = firebaseIdToken ? await verifyFirebaseIdToken(firebaseIdToken) : null;
    const email = claims?.email?.toLowerCase();
    if (!claims || !email || claims.email_verified !== true) {
      throw new UnauthorizedException('Email verification failed — please verify your email and try again');
    }
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        organization: true,
        roles: { include: { role: true } },
        clientProfile: { select: { id: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('No account found for this email — please create an account first');
    }
    return this.completeLogin(user);
  }

  private async completeLogin(user: any) {
    // Email verification is informational only — approval (HR + admin) is the real gate.
    // Self-heal: mark approved users as verified so records stay consistent.
    if (!user.emailVerified && (user.approvedAt || user.adminApprovedAt)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date(), emailVerifyToken: null, emailVerifyExpiresAt: null },
      });
    }
    if (user.rejectedAt) {
      throw new UnauthorizedException(
        user.rejectionReason ? `Your registration was rejected: ${user.rejectionReason}` : 'Your registration was rejected',
      );
    }
    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }
    if (!user.hrApprovedAt) {
      throw new UnauthorizedException('Your registration is pending HR review');
    }
    if (!user.approvedAt) {
      throw new UnauthorizedException('Your registration is pending admin approval');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const roleNames = user.roles.map((ur) => ur.role.name);
    const primaryRole =
      roleNames.includes('Client')
        ? 'Client'
        : ['Super Admin', 'Admin', 'Project Manager', 'HR Manager'].find((r) => roleNames.includes(r)) ??
      roleNames[0] ??
      'Employee';

    // Generate token
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        organizationId: user.organizationId,
        departmentId: user.departmentId,
        roles: roleNames,
        primaryRole,
        projectAccessStatus: user.projectAccessStatus ?? null,
        clientId: user.clientProfile?.id ?? null,
      },
      token,
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        clientProfile: { select: { id: true } },
        roles: {
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  }
}
