import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Put, Query, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, PRIVILEGED_ROLES, HR_ROLES, MANAGER_ROLES, hasAnyRole } from '../common/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../common/mail.service';
import { ClientAccess } from '../common/client-access';

const USER_SELECT = {
  id: true, email: true, firstName: true, lastName: true, isActive: true,
  avatar: true, lastLoginAt: true, createdAt: true, departmentId: true, teamId: true,
  approvedAt: true, emailVerified: true,
  hrApprovedAt: true, adminApprovedAt: true, rejectedAt: true, rejectionReason: true,
  department: { select: { id: true, name: true, color: true } },
  roles: { include: { role: { select: { id: true, name: true } } } },
  employeeProfile: true,
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  async findAll(organizationId: string, query: any) {
    const { departmentId, search, status, role, pending, stage } = query;
    const where: any = { organizationId };
    if (pending === 'true') where.approvedAt = null;
    if (stage === 'hr_pending') {
      where.emailVerified = { not: null };
      where.hrApprovedAt = null;
      where.approvedAt = null;
      where.rejectedAt = null;
    } else if (stage === 'admin_pending') {
      where.hrApprovedAt = { not: null };
      where.approvedAt = null;
      where.rejectedAt = null;
    } else if (stage === 'rejected') {
      where.rejectedAt = { not: null };
    } else if (stage === 'approved') {
      where.approvedAt = { not: null };
    } else if (stage === 'all_pending') {
      where.approvedAt = null;
      where.rejectedAt = null;
    }
    if (departmentId) where.departmentId = departmentId;
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.roles = { some: { role: { name: role } } };
    const users = await this.prisma.user.findMany({ where, select: USER_SELECT, orderBy: { firstName: 'asc' } });
    return users.map((u) => ({ ...u, roleNames: u.roles.map((r) => r.role.name), roles: u.roles }));
  }

  async findOne(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId }, select: USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return { ...user, roleNames: user.roles.map((r) => r.role.name) };
  }

  async nextEmployeeId() {
    const count = await prismaCount(this.prisma);
    return `DD-${String(count + 1).padStart(3, '0')}`;
    async function prismaCount(prisma: PrismaService) {
      return prisma.employeeProfile.count();
    }
  }

  async create(data: any, actorId: string, organizationId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('User with this email already exists');
    const passwordHash = await bcrypt.hash(data.password || 'Welcome@123', 10);
    const employeeId = data.employeeId || (await this.nextEmployeeId());

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        organizationId,
        departmentId: data.departmentId || null,
        teamId: data.teamId || null,
        // Admin-provisioned accounts are pre-verified and pre-approved at both stages
        emailVerified: new Date(),
        approvedAt: new Date(),
        hrApprovedAt: new Date(),
        adminApprovedAt: new Date(),
        employeeProfile: {
          create: {
            employeeId,
            designation: data.designation,
            reportingManager: data.reportingManager,
            dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : new Date(),
            phone: data.phone,
            employmentStatus: 'active',
          },
        },
        preferences: { create: {} },
      },
      select: USER_SELECT,
    });

    for (const roleName of data.roleNames?.length ? data.roleNames : ['Employee']) {
      const role = await this.prisma.role.findUnique({ where: { name: roleName } });
      if (role) {
        await this.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }).catch(() => {});
      }
    }

    await this.prisma.auditLog.create({
      data: { organizationId, userId: actorId, action: 'create', resource: 'user', resourceId: user.id, changes: { email: user.email } },
    });
    return this.findOne(user.id, organizationId);
  }

  async update(id: string, data: any, actorId: string, actor: any, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    const isSelf = actorId === id;
    const isHr = hasAnyRole(actor, HR_ROLES);
    if (!isSelf && !isHr) throw new ForbiddenException('Only HR or Admin can edit other users');

    // Non-privileged users can't change roles on anyone but PMs can't grant admin
    if (data.roleNames && !isHr) throw new ForbiddenException('Only Admin/HR can change roles');

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        isActive: data.isActive ?? undefined,
        avatar: data.avatar !== undefined ? data.avatar : undefined,
        departmentId: data.departmentId !== undefined ? data.departmentId : undefined,
        teamId: data.teamId !== undefined ? data.teamId : undefined,
      },
    });

    if (data.profile) {
      const p = data.profile;
      await this.prisma.employeeProfile.upsert({
        where: { userId: id },
        update: {
          designation: p.designation, reportingManager: p.reportingManager,
          dateOfJoining: p.dateOfJoining ? new Date(p.dateOfJoining) : undefined,
          phone: p.phone, address: p.address, emergencyContact: p.emergencyContact,
          employmentStatus: p.employmentStatus, leaveBalance: p.leaveBalance,
          dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : undefined, gender: p.gender,
        },
        create: {
          userId: id,
          employeeId: p.employeeId || (await this.nextEmployeeId()),
          designation: p.designation, reportingManager: p.reportingManager,
          phone: p.phone, address: p.address, emergencyContact: p.emergencyContact,
          employmentStatus: p.employmentStatus || 'active', leaveBalance: p.leaveBalance ?? 20,
        },
      });
    }

    if (data.roleNames) {
      // Remove existing non-preserved roles then add new
      const keep = new Set<string>(data.roleNames);
      const current = await this.prisma.userRole.findMany({ where: { userId: id }, include: { role: true } });
      for (const ur of current) {
        if (!keep.has(ur.role.name)) await this.prisma.userRole.delete({ where: { id: ur.id } });
      }
      for (const roleName of keep) {
        const role = await this.prisma.role.findUnique({ where: { name: roleName } });
        if (role && !current.some((ur) => ur.roleId === role.id)) {
          await this.prisma.userRole.create({ data: { userId: id, roleId: role.id } });
        }
      }
    }

    if (data.password) {
      await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(data.password, 10) } });
    }

    await this.prisma.auditLog.create({
      data: { organizationId, userId: actorId, action: 'update', resource: 'user', resourceId: id },
    });
    return this.findOne(id, organizationId);
  }

  /** Stage 1 — HR review of a self-registered account. */
  async hrReview(id: string, approve: boolean, reason: string | undefined, actorId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.rejectedAt || user.approvedAt) throw new ForbiddenException('This registration is already finalized');

    if (approve) {
      if (!user.emailVerified) throw new ForbiddenException('Cannot approve an unverified email');
      if (user.hrApprovedAt) throw new ForbiddenException('HR has already reviewed this registration');
      await this.prisma.user.update({ where: { id }, data: { hrApprovedAt: new Date() } });
      // Notify admins that the request now awaits admin approval
      const adminIds = await this.notifications.userIdsWithRoles(organizationId, PRIVILEGED_ROLES);
      await this.notifications.notifyMany(
        adminIds.filter((a) => a !== actorId),
        'registration_admin_pending',
        'Registration awaiting admin approval',
        `HR approved "${user.firstName} ${user.lastName}" (${user.email}) — admin approval required`,
        '/employees',
      );
      await this.prisma.auditLog.create({
        data: { organizationId, userId: actorId, action: 'hr_approve', resource: 'user', resourceId: id, changes: { email: user.email } },
      });
      return { id, stage: 'pending_admin' };
    }

    await this.prisma.user.update({
      where: { id },
      data: { rejectedAt: new Date(), rejectionReason: reason?.trim() || 'Rejected by HR', isActive: false },
    });
    await this.prisma.auditLog.create({
      data: { organizationId, userId: actorId, action: 'hr_reject', resource: 'user', resourceId: id, changes: { email: user.email, reason } },
    });
    return { id, stage: 'rejected' };
  }

  /** Stage 2 — Admin final approval; activates the account and emails the employee. */
  async adminReview(id: string, approve: boolean, reason: string | undefined, actorId: string, actor: any, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.rejectedAt || user.approvedAt) throw new ForbiddenException('This registration is already finalized');

    if (approve) {
      if (!user.hrApprovedAt) throw new ForbiddenException('HR must approve this registration before admin approval');
      const updated = await this.prisma.user.update({
        where: { id },
        data: { adminApprovedAt: new Date(), approvedAt: new Date(), isActive: true },
      });
      await this.prisma.auditLog.create({
        data: { organizationId, userId: actorId, action: 'admin_approve', resource: 'user', resourceId: id, changes: { email: user.email } },
      });
      await this.notifications.notify(
        user.id,
        'account_approved',
        'Your account is active',
        'Your LOOPLY account has been approved — you can now sign in.',
        '/employee',
      );
      await this.mail.send(
        user.email,
        'Your LOOPLY account is active',
        `Hi ${user.firstName},\n\nYour account has been approved by HR and admin.\nSign in at ${this.mail.appUrl('/login')} with your email and password.`,
      );
      return { id, approvedAt: updated.approvedAt, stage: 'approved' };
    }

    await this.prisma.user.update({
      where: { id },
      data: { rejectedAt: new Date(), rejectionReason: reason?.trim() || 'Rejected by admin', isActive: false },
    });
    await this.prisma.auditLog.create({
      data: { organizationId, userId: actorId, action: 'admin_reject', resource: 'user', resourceId: id, changes: { email: user.email, reason } },
    });
    return { id, stage: 'rejected' };
  }

  async deactivate(id: string, actorId: string, organizationId: string) {
    if (id === actorId) throw new ForbiddenException('You cannot deactivate your own account');
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive: !user.isActive } });
    await this.prisma.auditLog.create({
      data: { organizationId, userId: actorId, action: updated.isActive ? 'reactivate' : 'deactivate', resource: 'user', resourceId: id },
    });
    return { id, isActive: updated.isActive };
  }

  /** Permanently delete a user. Admin-only. Blocked for self and for the
   *  last remaining Super Admin; users with dependent records must be
   *  deactivated instead. */
  async remove(id: string, actorId: string, actor: any, organizationId: string) {
    if (id === actorId) throw new ForbiddenException('You cannot delete your own account');
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const isSuperAdmin = user.roles.some((ur) => ur.role.name === 'Super Admin');
    if (isSuperAdmin) {
      const admins = await this.prisma.userRole.findMany({
        where: { role: { name: 'Super Admin' }, user: { organizationId, isActive: true } },
        select: { userId: true },
      });
      if (admins.length <= 1) throw new ForbiddenException('Cannot delete the last Super Admin account');
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch {
      throw new ConflictException('This user has related records and cannot be permanently deleted — deactivate the account instead');
    }
    await this.prisma.auditLog.create({
      data: { organizationId, userId: actorId, action: 'delete', resource: 'user', resourceId: id, changes: { email: user.email } },
    });
    return { message: 'User deleted' };
  }

  async updateAvatar(id: string, avatar: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id }, data: { avatar } });
  }

  /** Counts for the registration-requests dashboard. */
  async registrationStats(organizationId: string) {
    const [total, pendingHR, pendingAdmin, rejected, approved] = await Promise.all([
      this.prisma.user.count({ where: { organizationId } }),
      this.prisma.user.count({ where: { organizationId, emailVerified: { not: null }, hrApprovedAt: null, approvedAt: null, rejectedAt: null } }),
      this.prisma.user.count({ where: { organizationId, hrApprovedAt: { not: null }, approvedAt: null, rejectedAt: null } }),
      this.prisma.user.count({ where: { organizationId, rejectedAt: { not: null } } }),
      this.prisma.user.count({ where: { organizationId, approvedAt: { not: null } } }),
    ]);
    return { total, pendingHR, pendingAdmin, rejected, approved };
  }

  rolesList() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, description: true } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...USER_SELECT, preferences: true, clientProfile: { select: { id: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    const { clientProfile, ...safeUser } = user;
    return {
      ...safeUser,
      clientId: clientProfile?.id ?? null,
      roleNames: user.roles.map((r) => r.role.name),
    };
  }
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ClientAccess()
  me(@Request() req: any) {
    return this.users.me(req.user.id);
  }

  @Get('roles')
  roles() {
    return this.users.rolesList();
  }

  @Get('registration-stats')
  @Roles(...HR_ROLES, ...MANAGER_ROLES)
  registrationStats(@Request() req: any) {
    return this.users.registrationStats(req.user.organizationId);
  }

  @Get('next-employee-id')
  @Roles(...HR_ROLES, ...MANAGER_ROLES)
  nextEmployeeId() {
    return this.users.nextEmployeeId();
  }

  @Get()
  @Roles(...HR_ROLES, ...MANAGER_ROLES)
  findAll(@Request() req: any, @Query() query: any) {
    return this.users.findAll(req.user.organizationId, query);
  }

  @Get(':id')
  @Roles(...HR_ROLES, ...MANAGER_ROLES)
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.users.findOne(id, req.user.organizationId);
  }

  @Post()
  @Roles(...HR_ROLES)
  create(@Body() body: any, @Request() req: any) {
    return this.users.create(body, req.user.id, req.user.organizationId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.users.update(id, body, req.user.id, req.user, req.user.organizationId);
  }

  @Post(':id/hr-approve')
  @Roles(...HR_ROLES)
  hrApprove(@Param('id') id: string, @Request() req: any) {
    return this.users.hrReview(id, true, undefined, req.user.id, req.user.organizationId);
  }

  @Post(':id/hr-reject')
  @Roles(...HR_ROLES)
  hrReject(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.users.hrReview(id, false, body?.reason, req.user.id, req.user.organizationId);
  }

  @Post(':id/admin-approve')
  @Roles(...PRIVILEGED_ROLES)
  adminApprove(@Param('id') id: string, @Request() req: any) {
    return this.users.adminReview(id, true, undefined, req.user.id, req.user, req.user.organizationId);
  }

  @Post(':id/admin-reject')
  @Roles(...PRIVILEGED_ROLES)
  adminReject(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.users.adminReview(id, false, body?.reason, req.user.id, req.user, req.user.organizationId);
  }

  @Post(':id/deactivate')
  @Roles(...HR_ROLES)
  deactivate(@Param('id') id: string, @Request() req: any) {
    return this.users.deactivate(id, req.user.id, req.user.organizationId);
  }

  @Delete(':id')
  @Roles(...PRIVILEGED_ROLES)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.users.remove(id, req.user.id, req.user, req.user.organizationId);
  }

  @Post(':id/avatar')
  @Roles(...HR_ROLES)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'avatars');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
          cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => cb(/^image\//.test(file.mimetype) ? null : new ForbiddenException('Only image files are allowed'), /^image\//.test(file.mimetype)),
    }),
  )
  async avatar(@Param('id') id: string, @UploadedFile() file: any, @Request() req: any) {
    if (!file) throw new NotFoundException('No file uploaded');
    const user = await this.users.findOne(id, req.user.organizationId);
    const url = `/uploads/avatars/${file.filename}`;
    await this.users.updateAvatar(id, url, req.user.organizationId);
    return { id: user.id, avatar: url };
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService, MailService],
})
export class UsersModule {}
