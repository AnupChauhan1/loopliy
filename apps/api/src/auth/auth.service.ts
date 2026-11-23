import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../common/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HR_ROLES } from '../common/roles';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

const DEFAULT_ORG_SLUG = 'epatang-agency';

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
  async signup(dto: SignupDto, avatarUrl?: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const org =
      (await this.prisma.organization.findUnique({ where: { slug: DEFAULT_ORG_SLUG } })) ??
      (await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })) ??
      (await this.prisma.organization.create({ data: { name: 'LOOPLY', slug: DEFAULT_ORG_SLUG } }));

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const verifyToken = randomBytes(32).toString('hex');

    const accountType = dto.accountType ?? 'employee';
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
        emailVerifyToken: verifyToken,
        emailVerifyExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

    const verifyUrl = this.mail.appUrl(`/verify-email?email=${encodeURIComponent(email)}&token=${verifyToken}`);
    await this.mail.send(
      email,
      'Verify your LOOPLY account',
      `Hi ${user.firstName},\n\nVerify your email to continue your LOOPLY registration:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    );

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
      message: 'Registration submitted. Check your email to verify your address — HR and an admin will then review your account.',
      userId: user.id,
      // Exposed only outside production so local/dev flows remain testable
      // without SMTP. Never set this in production.
      ...(process.env.NODE_ENV !== 'production' ? { devVerifyToken: verifyToken } : {}),
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

    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email address before signing in');
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
