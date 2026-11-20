import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, HR_ROLES } from '../common/roles';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  list(user: any, query: any) {
    const { status, userId, mine } = query;
    const where: any = { user: { organizationId: user.organizationId } };
    const isHr = ['Super Admin', 'Admin', 'HR Manager'].some((r) => (user.roles || []).some((ur: any) => ur.role?.name === r));
    if (mine === 'true' || !isHr) where.userId = user.id;
    else if (userId) where.userId = userId;
    if (status) where.status = status;
    return this.prisma.leaveRequest.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, department: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async apply(data: any, user: any) {
    const days = Math.max(1, Math.ceil((new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / 86400000) + 1);
    const leave = await this.prisma.leaveRequest.create({
      data: {
        userId: user.id,
        type: data.type || 'casual',
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        days: data.days ? Number(data.days) : days,
        reason: data.reason,
      },
    });
    const hrUsers = await this.notifications.userIdsWithRoles(user.organizationId, HR_ROLES);
    await this.notifications.notifyMany(
      hrUsers.filter((id) => id !== user.id),
      'leave_submitted',
      'Leave request submitted',
      `${user.firstName} ${user.lastName} requested ${leave.days} day(s) of ${leave.type} leave`,
      '/leave',
    );
    return leave;
  }

  async decide(id: string, action: 'approve' | 'reject', user: any) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, user: { organizationId: user.organizationId } },
      include: { user: { select: { id: true, firstName: true } } },
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'pending') throw new BadRequestException('Leave already decided');

    const status = action === 'approve' ? 'approved' : 'rejected';
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status, approvedBy: user.id, approvedAt: new Date() },
    });
    // Deduct balance on approval
    if (action === 'approve') {
      await this.prisma.employeeProfile.updateMany({
        where: { userId: leave.userId },
        data: { leaveBalance: { decrement: leave.days } },
      });
    }
    await this.notifications.notify(
      leave.userId,
      `leave_${status}`,
      `Leave ${status}`,
      `Your ${leave.type} leave (${leave.days} day(s)) was ${status}`,
      '/leave',
    );
    return updated;
  }

  holidays(organizationId: string) {
    return this.prisma.holiday.findMany({ where: { organizationId }, orderBy: { date: 'asc' } });
  }

  async addHoliday(data: any, organizationId: string) {
    return this.prisma.holiday.create({ data: { name: data.name, date: new Date(data.date), organizationId } });
  }

  async removeHoliday(id: string, organizationId: string) {
    await this.prisma.holiday.deleteMany({ where: { id, organizationId } });
    return { message: 'Holiday removed' };
  }
}

@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get()
  list(@Request() req: any, @Query() query: any) {
    return this.leave.list(req.user, query);
  }

  @Post()
  apply(@Body() body: any, @Request() req: any) {
    return this.leave.apply(body, req.user);
  }

  @Post(':id/decide')
  @Roles(...HR_ROLES)
  decide(@Param('id') id: string, @Body() body: { action: 'approve' | 'reject' }, @Request() req: any) {
    return this.leave.decide(id, body.action, req.user);
  }

  @Get('holidays')
  holidays(@Request() req: any) {
    return this.leave.holidays(req.user.organizationId);
  }

  @Post('holidays')
  @Roles(...HR_ROLES)
  addHoliday(@Body() body: any, @Request() req: any) {
    return this.leave.addHoliday(body, req.user.organizationId);
  }

  @Delete('holidays/:id')
  @Roles(...HR_ROLES)
  removeHoliday(@Param('id') id: string, @Request() req: any) {
    return this.leave.removeHoliday(id, req.user.organizationId);
  }
}

@Module({
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
