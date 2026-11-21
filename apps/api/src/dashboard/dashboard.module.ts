import { Controller, Get, Injectable, Module, Query, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { hasAnyRole, MANAGER_ROLES, HR_ROLES, PRIVILEGED_ROLES } from '../common/roles';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /** Lightweight task-status aggregation for the dashboard chart.
   *  Single GROUP BY query — no record hydration. */
  async taskStatus(user: any, period?: string, from?: string, to?: string) {
    const organizationId = user.organizationId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const taskBase: any = { OR: [{ project: { organizationId } }, { projectId: null }] };

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (period === 'week') {
      periodStart = new Date(todayStart);
      periodStart.setDate(periodStart.getDate() - ((now.getDay() + 6) % 7));
    } else if (period === 'month') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      periodStart = new Date(now.getFullYear(), 0, 1);
    } else if (period === 'custom' && from) {
      periodStart = new Date(from);
      if (Number.isNaN(periodStart.getTime())) periodStart = null;
      if (to) {
        periodEnd = new Date(to);
        if (Number.isNaN(periodEnd.getTime())) periodEnd = null;
      }
    }

    const where: any = periodStart
      ? {
          AND: [
            taskBase,
            {
              OR: [
                { status: { notIn: ['completed', 'cancelled', 'approved'] } },
                { completedAt: { gte: periodStart, ...(periodEnd ? { lt: periodEnd } : {}) } },
                { updatedAt: { gte: periodStart, ...(periodEnd ? { lt: periodEnd } : {}) } },
              ],
            },
          ],
        }
      : taskBase;

    const grouped = await this.prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } });
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    return { byStatus, total: grouped.reduce((s, g) => s + g._count._all, 0), period: period ?? 'all' };
  }

  async stats(user: any, period?: string) {
    const organizationId = user.organizationId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isManager = hasAnyRole(user, MANAGER_ROLES);
    const isHr = hasAnyRole(user, HR_ROLES);

    const taskBase: any = { OR: [{ project: { organizationId } }, { projectId: null }] };
    const myTasks: any = { ...taskBase, assignees: { some: { userId: user.id } } };

    const openStatuses = { notIn: ['completed', 'cancelled', 'approved'] };

    // Optional period filter for the by-status chart: tasks *active* in the period, i.e.
    // still open, or completed/updated since the period started. (Filtering on updatedAt
    // alone hid every open task that simply hadn't been edited this week.)
    let periodStart: Date | null = null;
    if (period === 'week') {
      periodStart = new Date(todayStart);
      periodStart.setDate(periodStart.getDate() - ((now.getDay() + 6) % 7)); // Monday
    } else if (period === 'month') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      periodStart = new Date(now.getFullYear(), 0, 1);
    }
    const statusWhere: any = periodStart
      ? {
          AND: [
            taskBase,
            { OR: [{ status: openStatuses }, { completedAt: { gte: periodStart } }, { updatedAt: { gte: periodStart } }] },
          ],
        }
      : taskBase;

    const departmentQuery = isManager || isHr
      ? this.prisma.department.findMany({
          where: { organizationId, isArchived: false },
          select: { id: true, name: true, color: true, _count: { select: { members: true } } },
        })
      : Promise.resolve([]);

    const [
      totalUsers, activeUsers, departments, projects, activeProjects,
      totalTasks, tasksByStatus, myByStatus, overdueTasks, myOverdue,
      inReview, todayTasks, pendingLeave, pendingCreatives, pendingVideos,
      recentNotifications, unreadNotifications, departmentList,
    ] = await Promise.all([
      this.prisma.user.count({ where: { organizationId } }),
      this.prisma.user.count({ where: { organizationId, isActive: true } }),
      this.prisma.department.count({ where: { organizationId, isArchived: false } }),
      this.prisma.project.count({ where: { organizationId } }),
      this.prisma.project.count({ where: { organizationId, status: 'active' } }),
      this.prisma.task.count({ where: taskBase }),
      this.prisma.task.groupBy({ by: ['status'], where: statusWhere, _count: true }),
      this.prisma.task.groupBy({ by: ['status'], where: myTasks, _count: true }),
      this.prisma.task.count({ where: { ...taskBase, deadline: { lt: now }, status: openStatuses } }),
      this.prisma.task.count({ where: { ...myTasks, deadline: { lt: now }, status: openStatuses } }),
      this.prisma.task.count({ where: { ...taskBase, status: 'in_review' } }),
      this.prisma.task.count({ where: { ...myTasks, deadline: { gte: todayStart, lt: new Date(todayStart.getTime() + 86400000) }, status: openStatuses } }),
      this.prisma.leaveRequest.count({ where: { status: 'pending', user: { organizationId } } }),
      this.prisma.creativeRequest.count({ where: { organizationId, status: { in: ['submitted_strategy', 'pending_manager'] } } }),
      this.prisma.videoRequest.count({ where: { organizationId, status: 'internal_review' } }),
      this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.notification.count({ where: { userId: user.id, read: false } }),
      departmentQuery,
    ]);

    const byStatus = Object.fromEntries(tasksByStatus.map((s) => [s.status, s._count]));
    const myStatus = Object.fromEntries(myByStatus.map((s) => [s.status, s._count]));

    // Daily created/completed counts for the last 14 days (sparklines + trend chart)
    const TREND_DAYS = 14;
    const trendStart = new Date(todayStart);
    trendStart.setDate(trendStart.getDate() - (TREND_DAYS - 1));
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const [
      totalByDepartment, completedByDepartment, overdueByDepartment,
      createdRecent, completedRecent,
      [newUsers, newDepartments, newProjects, newTasks, enteredReview, newlyOverdue, newLeave, newCreatives, newVideos],
      upcomingDeadlines,
    ] = await Promise.all([
      isManager || isHr
        ? this.prisma.task.groupBy({
            by: ['departmentId'],
            where: { ...taskBase, departmentId: { not: null } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      isManager || isHr
        ? this.prisma.task.groupBy({
            by: ['departmentId'],
            where: { ...taskBase, departmentId: { not: null }, status: 'completed' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      isManager || isHr
        ? this.prisma.task.groupBy({
            by: ['departmentId'],
            where: { ...taskBase, departmentId: { not: null }, deadline: { lt: now }, status: openStatuses },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      this.prisma.task.findMany({ where: { ...taskBase, createdAt: { gte: trendStart } }, select: { createdAt: true } }),
      this.prisma.task.findMany({ where: { ...taskBase, completedAt: { gte: trendStart } }, select: { completedAt: true } }),
      Promise.all([
        this.prisma.user.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
        this.prisma.department.count({ where: { organizationId, isArchived: false, createdAt: { gte: weekAgo } } }),
        this.prisma.project.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
        this.prisma.task.count({ where: { ...taskBase, createdAt: { gte: weekAgo } } }),
        this.prisma.taskStatusHistory.count({ where: { toStatus: 'in_review', changedAt: { gte: weekAgo }, task: taskBase } }),
        this.prisma.task.count({ where: { ...taskBase, deadline: { gte: weekAgo, lt: now }, status: openStatuses } }),
        this.prisma.leaveRequest.count({ where: { status: 'pending', user: { organizationId }, createdAt: { gte: weekAgo } } }),
        this.prisma.creativeRequest.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
        this.prisma.videoRequest.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
      ]),
      this.prisma.task.findMany({
        where: { ...myTasks, deadline: { gte: todayStart }, status: openStatuses },
        include: {
          project: { select: { id: true, name: true } },
          assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        },
        orderBy: { deadline: 'asc' },
        take: 6,
      }),
    ]);

    const trend = Array.from({ length: TREND_DAYS }, (_, i) => {
      const d = new Date(trendStart);
      d.setDate(d.getDate() + i);
      return { date: dayKey(d), created: 0, completed: 0 };
    });
    const trendIndex = new Map(trend.map((t, i) => [t.date, i]));
    for (const t of createdRecent) {
      const i = trendIndex.get(dayKey(t.createdAt));
      if (i !== undefined) trend[i].created++;
    }
    for (const t of completedRecent) {
      const i = t.completedAt ? trendIndex.get(dayKey(t.completedAt)) : undefined;
      if (i !== undefined) trend[i].completed++;
    }

    const countByDepartment = (rows: { departmentId: string | null; _count: { _all: number } }[]) =>
      new Map(rows.map((row) => [row.departmentId, row._count._all]));
    const totalDepartmentCounts = countByDepartment(totalByDepartment);
    const completedDepartmentCounts = countByDepartment(completedByDepartment);
    const overdueDepartmentCounts = countByDepartment(overdueByDepartment);
    const departmentStats = departmentList.map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      members: d._count.members,
      total: totalDepartmentCounts.get(d.id) ?? 0,
      completed: completedDepartmentCounts.get(d.id) ?? 0,
      overdue: overdueDepartmentCounts.get(d.id) ?? 0,
    }));

    const recent = {
      users: newUsers, departments: newDepartments, projects: newProjects, tasks: newTasks,
      inReview: enteredReview, overdue: newlyOverdue, pendingLeave: newLeave, approvals: newCreatives + newVideos,
    };

    return {
      isManager, isHr, isAdmin: hasAnyRole(user, PRIVILEGED_ROLES),
      org: { totalUsers, activeUsers, departments, projects, activeProjects },
      tasks: { total: totalTasks, byStatus, my: myStatus, overdue: overdueTasks, myOverdue, inReview, todayTasks },
      approvals: { inReview, pendingCreatives, pendingVideos },
      hr: { pendingLeave },
      departmentStats,
      trend,
      recent,
      upcomingDeadlines,
      recentNotifications,
      unreadNotifications,
    };
  }

  async navStats(user: any) {
    const organizationId = user.organizationId;
    const taskBase = { OR: [{ project: { organizationId } }, { projectId: null }] };
    const isHr = hasAnyRole(user, HR_ROLES);
    const [inReview, pendingCreatives, pendingVideos, pendingLeave] = await Promise.all([
      this.prisma.task.count({ where: { ...taskBase, status: 'in_review' } }),
      this.prisma.creativeRequest.count({ where: { organizationId, status: { in: ['submitted_strategy', 'pending_manager'] } } }),
      this.prisma.videoRequest.count({ where: { organizationId, status: 'internal_review' } }),
      isHr
        ? this.prisma.leaveRequest.count({ where: { status: 'pending', user: { organizationId } } })
        : Promise.resolve(0),
    ]);

    return {
      approvals: { inReview, pendingCreatives, pendingVideos },
      hr: { pendingLeave },
    };
  }

  async managerStats(user: any) {
    const organizationId = user.organizationId;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const taskBase = { OR: [{ project: { organizationId } }, { projectId: null }] };
    const openStatuses = { notIn: ['completed', 'cancelled', 'approved'] };
    const [
      projects, totalTasks, overdue, inReview, pendingCreatives, pendingVideos,
      newProjects, newTasks, enteredReview, newlyOverdue,
    ] = await Promise.all([
      this.prisma.project.count({ where: { organizationId } }),
      this.prisma.task.count({ where: taskBase }),
      this.prisma.task.count({ where: { ...taskBase, deadline: { lt: now }, status: openStatuses } }),
      this.prisma.task.count({ where: { ...taskBase, status: 'in_review' } }),
      this.prisma.creativeRequest.count({ where: { organizationId, status: { in: ['submitted_strategy', 'pending_manager'] } } }),
      this.prisma.videoRequest.count({ where: { organizationId, status: 'internal_review' } }),
      this.prisma.project.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
      this.prisma.task.count({ where: { ...taskBase, createdAt: { gte: weekAgo } } }),
      this.prisma.taskStatusHistory.count({ where: { toStatus: 'in_review', changedAt: { gte: weekAgo }, task: taskBase } }),
      this.prisma.task.count({ where: { ...taskBase, deadline: { gte: weekAgo, lt: now }, status: openStatuses } }),
    ]);

    return {
      org: { projects },
      tasks: { total: totalTasks, overdue },
      approvals: { inReview, pendingCreatives, pendingVideos },
      recent: { projects: newProjects, tasks: newTasks, inReview: enteredReview, overdue: newlyOverdue },
    };
  }

  async hrStats(user: any) {
    const organizationId = user.organizationId;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const taskBase = { OR: [{ project: { organizationId } }, { projectId: null }] };
    const openStatuses = { notIn: ['completed', 'cancelled', 'approved'] };
    const [totalUsers, departments, overdue, newUsers, newDepartments, newlyOverdue, newLeave] = await Promise.all([
      this.prisma.user.count({ where: { organizationId } }),
      this.prisma.department.count({ where: { organizationId, isArchived: false } }),
      this.prisma.task.count({ where: { ...taskBase, deadline: { lt: now }, status: openStatuses } }),
      this.prisma.user.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
      this.prisma.department.count({ where: { organizationId, isArchived: false, createdAt: { gte: weekAgo } } }),
      this.prisma.task.count({ where: { ...taskBase, deadline: { gte: weekAgo, lt: now }, status: openStatuses } }),
      this.prisma.leaveRequest.count({ where: { status: 'pending', user: { organizationId }, createdAt: { gte: weekAgo } } }),
    ]);

    return {
      org: { totalUsers, departments },
      tasks: { overdue },
      recent: { users: newUsers, departments: newDepartments, overdue: newlyOverdue, pendingLeave: newLeave },
    };
  }

  async myStats(user: any) {
    const taskBase = { OR: [{ project: { organizationId: user.organizationId } }, { projectId: null }] };
    const myByStatus = await this.prisma.task.groupBy({
      by: ['status'],
      where: { ...taskBase, assignees: { some: { userId: user.id } } },
      _count: true,
    });

    return { tasks: { my: Object.fromEntries(myByStatus.map((row) => [row.status, row._count])) } };
  }
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  stats(@Request() req: any, @Query('period') period?: string) {
    return this.dashboard.stats(req.user, period);
  }

  @Get('task-status')
  taskStatus(@Request() req: any, @Query('period') period?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboard.taskStatus(req.user, period, from, to);
  }

  @Get('nav-stats')
  navStats(@Request() req: any) {
    return this.dashboard.navStats(req.user);
  }

  @Get('manager-stats')
  managerStats(@Request() req: any) {
    return this.dashboard.managerStats(req.user);
  }

  @Get('hr-stats')
  hrStats(@Request() req: any) {
    return this.dashboard.hrStats(req.user);
  }

  @Get('my-stats')
  myStats(@Request() req: any) {
    return this.dashboard.myStats(req.user);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
