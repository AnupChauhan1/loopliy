import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, MANAGER_ROLES, PRIVILEGED_ROLES, hasAnyRole } from '../common/roles';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string, includeArchived = false) {
    return this.prisma.department.findMany({
      where: { organizationId, ...(includeArchived ? {} : { isArchived: false }) },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { members: true, tasks: true, projects: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, organizationId },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, email: true } },
        members: {
          where: { isActive: true },
          select: { id: true, firstName: true, lastName: true, email: true, employeeProfile: { select: { designation: true, employeeId: true } } },
        },
        teams: { include: { lead: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { members: true } } } },
        projects: { select: { id: true, name: true, status: true, progress: true, deadline: true } },
      },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async stats(id: string, organizationId: string) {
    const now = new Date();
    const base = { departmentId: id, project: { organizationId } };
    const [total, byStatus, overdue, pendingApprovals] = await Promise.all([
      this.prisma.task.count({ where: base }),
      this.prisma.task.groupBy({ by: ['status'], where: base, _count: true }),
      this.prisma.task.count({ where: { ...base, deadline: { lt: now }, status: { notIn: ['completed', 'cancelled', 'approved'] } } }),
      this.prisma.task.count({ where: { ...base, status: 'in_review' } }),
    ]);
    const members = await this.prisma.user.count({ where: { departmentId: id, organizationId, isActive: true } });
    const workload = await this.prisma.user.findMany({
      where: { departmentId: id, organizationId, isActive: true },
      select: {
        id: true, firstName: true, lastName: true,
        _count: { select: { tasks: { where: { task: { status: { notIn: ['completed', 'cancelled'] } } } } } },
      },
    });
    return { total, byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])), overdue, pendingApprovals, members, workload };
  }

  async create(data: any, userId: string, organizationId: string) {
    const dept = await this.prisma.department.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        color: data.color,
        headId: data.headId || null,
        organizationId,
      },
    });
    await this.audit(organizationId, userId, 'create', dept.id, { dept });
    return dept;
  }

  async update(id: string, data: any, userId: string, organizationId: string) {
    const dept = await this.prisma.department.findFirst({ where: { id, organizationId } });
    if (!dept) throw new NotFoundException('Department not found');
    const updated = await this.prisma.department.update({
      where: { id },
      data: { name: data.name, code: data.code, description: data.description, color: data.color, headId: data.headId ?? undefined },
    });
    await this.audit(organizationId, userId, 'update', id, { before: dept, after: updated });
    return updated;
  }

  async archive(id: string, userId: string, organizationId: string) {
    const dept = await this.prisma.department.findFirst({ where: { id, organizationId } });
    if (!dept) throw new NotFoundException('Department not found');
    const updated = await this.prisma.department.update({ where: { id }, data: { isArchived: !dept.isArchived } });
    await this.audit(organizationId, userId, updated.isArchived ? 'archive' : 'unarchive', id, {});
    return updated;
  }

  async remove(id: string, userId: string, organizationId: string) {
    const dept = await this.prisma.department.findFirst({ where: { id, organizationId } });
    if (!dept) throw new NotFoundException('Department not found');
    const taskCount = await this.prisma.task.count({ where: { departmentId: id } });
    const memberCount = await this.prisma.user.count({ where: { departmentId: id } });
    if (taskCount > 0 || memberCount > 0) {
      throw new ForbiddenException('Department has members or tasks — archive it instead');
    }
    await this.prisma.department.delete({ where: { id } });
    await this.audit(organizationId, userId, 'delete', id, { dept });
    return { message: 'Department deleted' };
  }

  private audit(organizationId: string, userId: string, action: string, resourceId: string, changes: any) {
    return this.prisma.auditLog.create({
      data: { organizationId, userId, action, resource: 'department', resourceId, changes },
    });
  }
}

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  findAll(@Request() req: any, @Query('includeArchived') includeArchived?: string) {
    return this.departments.findAll(req.user.organizationId, includeArchived === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.departments.findOne(id, req.user.organizationId);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string, @Request() req: any) {
    return this.departments.stats(id, req.user.organizationId);
  }

  @Post()
  @Roles(...PRIVILEGED_ROLES)
  create(@Body() body: any, @Request() req: any) {
    return this.departments.create(body, req.user.id, req.user.organizationId);
  }

  @Put(':id')
  @Roles(...PRIVILEGED_ROLES)
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.departments.update(id, body, req.user.id, req.user.organizationId);
  }

  @Post(':id/archive')
  @Roles(...PRIVILEGED_ROLES)
  archive(@Param('id') id: string, @Request() req: any) {
    return this.departments.archive(id, req.user.id, req.user.organizationId);
  }

  @Delete(':id')
  @Roles(...PRIVILEGED_ROLES)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.departments.remove(id, req.user.id, req.user.organizationId);
  }
}

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
