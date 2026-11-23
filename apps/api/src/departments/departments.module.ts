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
        teams: {
          include: {
            lead: { select: { id: true, firstName: true, lastName: true } },
            _count: { select: { members: true } },
          },
          orderBy: { name: 'asc' },
        },
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

  async createTeam(departmentId: string, data: any, userId: string, organizationId: string) {
    const dept = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId } });
    if (!dept) throw new NotFoundException('Department not found');
    if (data.leadId) {
      const lead = await this.prisma.user.findFirst({ where: { id: data.leadId, organizationId, isActive: true } });
      if (!lead) throw new ForbiddenException('Invalid team lead');
    }
    const team = await this.prisma.team.create({
      data: { name: data.name, departmentId, leadId: data.leadId || null, organizationId },
      include: { lead: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { members: true } } },
    });
    await this.prisma.auditLog.create({
      data: { organizationId, userId, action: 'create', resource: 'team', resourceId: team.id, changes: { name: team.name, departmentId } },
    });
    return team;
  }

  async updateTeam(teamId: string, data: any, userId: string, organizationId: string) {
    const team = await this.prisma.team.findFirst({ where: { id: teamId, organizationId } });
    if (!team) throw new NotFoundException('Team not found');

    if (data.leadId) {
      const lead = await this.prisma.user.findFirst({ where: { id: data.leadId, organizationId, isActive: true } });
      if (!lead) throw new ForbiddenException('Invalid team lead');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.team.update({
        where: { id: teamId },
        data: {
          name: data.name ?? undefined,
          leadId: data.leadId !== undefined ? data.leadId || null : undefined,
        },
        include: { lead: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { members: true } } },
      });

      // Member assignment: set/clear teamId on the given users (org-scoped)
      if (Array.isArray(data.memberIds)) {
        const valid = await tx.user.findMany({
          where: { id: { in: data.memberIds }, organizationId },
          select: { id: true },
        });
        const validIds = valid.map((u) => u.id);
        await tx.user.updateMany({ where: { teamId: teamId }, data: { teamId: null } });
        if (validIds.length) {
          await tx.user.updateMany({ where: { id: { in: validIds } }, data: { teamId } });
        }
      }
      return t;
    });

    await this.prisma.auditLog.create({
      data: { organizationId, userId, action: 'update', resource: 'team', resourceId: teamId, changes: { name: updated.name } },
    });
    return updated;
  }

  async deleteTeam(teamId: string, userId: string, organizationId: string) {
    const team = await this.prisma.team.findFirst({ where: { id: teamId, organizationId } });
    if (!team) throw new NotFoundException('Team not found');
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { teamId }, data: { teamId: null } }),
      this.prisma.team.delete({ where: { id: teamId } }),
    ]);
    await this.prisma.auditLog.create({
      data: { organizationId, userId, action: 'delete', resource: 'team', resourceId: teamId, changes: { name: team.name } },
    });
    return { message: 'Team deleted' };
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

  // ---- Teams ----

  @Post(':id/teams')
  @Roles(...PRIVILEGED_ROLES)
  createTeam(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.departments.createTeam(id, body, req.user.id, req.user.organizationId);
  }

  @Put('teams/:teamId')
  @Roles(...PRIVILEGED_ROLES)
  updateTeam(@Param('teamId') teamId: string, @Body() body: any, @Request() req: any) {
    return this.departments.updateTeam(teamId, body, req.user.id, req.user.organizationId);
  }

  @Delete('teams/:teamId')
  @Roles(...PRIVILEGED_ROLES)
  deleteTeam(@Param('teamId') teamId: string, @Request() req: any) {
    return this.departments.deleteTeam(teamId, req.user.id, req.user.organizationId);
  }
}

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
