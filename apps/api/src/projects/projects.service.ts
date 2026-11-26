import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { SMM_CYCLE_1, SMM_CYCLE_2_PLUS, TemplateTaskSpec, addDays, addTenure, dueDateFor } from './smm-template';
import { hasAnyRole, MANAGER_ROLES, PRIVILEGED_ROLES } from '../common/roles';
import { projectProgress, projectProgressFromGroups } from '../common/progress';
import { smartMatch, isManagerCandidate } from '../common/auto-assign';

const TASK_INCLUDE = {
  assignees: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
};

interface AssigneeProfile {
  id: string;
  /** lowercase haystack: role names + department + designation + member role */
  text: string;
}

const MEMBER_USER_SELECT = {
  id: true,
  roles: { include: { role: { select: { name: true } } } },
  department: { select: { name: true } },
  employeeProfile: { select: { designation: true } },
} as const;

function profileText(u: any, memberRole?: string | null): string {
  return [
    ...(u.roles ?? []).map((r: any) => r.role?.name),
    u.department?.name,
    u.employeeProfile?.designation,
    memberRole,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  /** Resolve which auto-dated task specs apply for a project/cycle. */
  private specsFor(project: {
    planStructure?: string | null;
    service?: string | null;
    projectType?: string | null;
    taskTemplate?: any;
    currentCycle?: number | null;
  }, cycle: number, provided?: TemplateTaskSpec[]): TemplateTaskSpec[] {
    if (provided?.length) return provided;
    const isFixedSmm = project.planStructure === 'fixed' && project.service === 'smm';
    if (isFixedSmm) return cycle <= 1 ? SMM_CYCLE_1 : SMM_CYCLE_2_PLUS;
    const stored = Array.isArray(project.taskTemplate) ? (project.taskTemplate as TemplateTaskSpec[]) : [];
    return stored.filter((t) => t && typeof t.dayOffset === 'number' && t.title);
  }

  /**
   * Project progress is NEVER stored — it is always computed live from the
   * statuses of the project's tasks (weighted average of task progress %).
   */
  private async progressByProject(projectIds: string[]) {
    const map = new Map<string, number>();
    if (!projectIds.length) return map;
    const groups = await this.prisma.task.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: projectIds } },
      _count: { _all: true },
    });
    const byProject = new Map<string, typeof groups>();
    for (const g of groups) {
      if (!g.projectId) continue;
      const rows = byProject.get(g.projectId) ?? [];
      rows.push(g);
      byProject.set(g.projectId, rows);
    }
    for (const [projectId, rows] of byProject) {
      map.set(projectId, projectProgressFromGroups(rows));
    }
    return map;
  }

  private async withProgress<T extends { id: string }>(items: T[]) {
    const map = await this.progressByProject(items.map((i) => i.id));
    return items.map((i) => ({ ...i, progress: map.get(i.id) ?? 0 }));
  }

  /** All project members as assignable profiles (roles/dept/designation aware). */
  private async memberProfiles(projectId: string): Promise<AssigneeProfile[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: MEMBER_USER_SELECT } },
    });
    return rows.map((r) => ({ id: r.userId, text: profileText(r.user, r.role) }));
  }

  /** All approved (HR/admin) employees in the org as assignable profiles. */
  private async approvedEmployeeProfiles(organizationId: string): Promise<AssigneeProfile[]> {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { approvedAt: { not: null } },
          { hrApprovedAt: { not: null } },
          { adminApprovedAt: { not: null } },
        ],
      },
      select: MEMBER_USER_SELECT,
      take: 200,
    });
    return users.map((u) => ({ id: u.id, text: profileText(u) }));
  }

  /**
   * Members for distribution: project team, topped up with approved employees
   * whenever the team has fewer than 2 non-manager members — guarantees
   * execution tasks spread across real employees instead of landing 100%
   * on the Project Manager.
   */
  private async distributionPool(projectId: string, organizationId: string): Promise<AssigneeProfile[]> {
    const members = await this.memberProfiles(projectId);
    const execCount = members.filter((m) => !isManagerCandidate({ id: m.id, text: m.text })).length;
    if (execCount >= 2) return members;
    const approved = await this.approvedEmployeeProfiles(organizationId);
    const seen = new Set(members.map((m) => m.id));
    return [...members, ...approved.filter((a) => !seen.has(a.id))];
  }

  /**
   * Distribute tasks across members using the smart role engine: role/keyword
   * match first, least-loaded candidate wins, load tracked as we go.
   */
  private distribute<T extends { id: string; title: string }>(
    rows: T[],
    members: AssigneeProfile[],
  ): { taskId: string; userId: string; role: string }[] {
    const loads = new Map(members.map((m) => [m.id, 0]));
    return rows.map((t) => {
      const match = smartMatch(
        t.title,
        members.map((m) => ({ id: m.id, text: m.text, load: loads.get(m.id) ?? 0 })),
      );
      const uid =
        match?.candidateId ??
        members.reduce((a, b) => ((loads.get(a.id) ?? 0) <= (loads.get(b.id) ?? 0) ? a : b)).id;
      loads.set(uid, (loads.get(uid) ?? 0) + 1);
      return { taskId: t.id, userId: uid, role: match?.role ?? 'Team' };
    });
  }

  private async createCycleTasks(
    project: { id: string; organizationId: string; service?: string | null; planStructure?: string | null; projectType?: string | null; taskTemplate?: any; currentCycle?: number | null },
    cycle: number,
    cycleStart: Date,
    provided?: TemplateTaskSpec[],
    assignees?: AssigneeProfile[],
  ) {
    const specs = this.specsFor(project, cycle, provided);
    if (!specs.length) return { count: 0, byRole: {} as Record<string, number> };
    await this.prisma.task.createMany({
      data: specs.map((spec) => ({
        title: spec.title,
        description: `Day ${spec.dayOffset} · Cycle ${cycle}`,
        status: 'todo',
        priority: 'medium',
        category: project.service ?? undefined,
        projectId: project.id,
        organizationId: project.organizationId,
        dayOffset: spec.dayOffset,
        cycle,
        deadline: dueDateFor(cycleStart, spec.dayOffset),
      })),
    });
    // Auto-assign every generated task across the project's team using the
    // smart role engine (role keyword match + least-loaded balance).
    const byRole: Record<string, number> = {};
    if (assignees?.length) {
      const created = await this.prisma.task.findMany({
        where: { projectId: project.id, cycle },
        orderBy: [{ dayOffset: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true },
      });
      if (created.length) {
        const rows = this.distribute(created, assignees);
        await this.prisma.taskAssignee.createMany({
          data: rows.map((r) => ({ taskId: r.taskId, userId: r.userId })),
          skipDuplicates: true,
        });
        for (const r of rows) byRole[r.role] = (byRole[r.role] ?? 0) + 1;
      }
    }
    return { count: specs.length, byRole };
  }

  async create(createProjectDto: CreateProjectDto, userId: string, organizationId: string) {
    // If clientId is provided, verify it belongs to the organization
    if (createProjectDto.clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: createProjectDto.clientId },
      });

      if (!client || client.organizationId !== organizationId) {
        throw new ForbiddenException('Invalid client or access denied');
      }
    }

    const { taskTemplate, managerId, assignedEmployeeIds, ...fields } = createProjectDto;

    // Resolve optional assignment: project lead + team members must be active org users
    let leadId = userId;
    if (managerId && managerId !== userId) {
      const lead = await this.prisma.user.findFirst({
        where: { id: managerId, organizationId, isActive: true },
        select: { id: true },
      });
      if (lead) leadId = lead.id;
    }
    const memberUsers = assignedEmployeeIds?.length
      ? await this.prisma.user.findMany({
          where: { id: { in: assignedEmployeeIds }, organizationId, isActive: true },
          select: MEMBER_USER_SELECT,
        })
      : [];
    const memberIds = memberUsers.map((u) => u.id);
    const selectedProfiles: AssigneeProfile[] = memberUsers.map((u) => ({
      id: u.id,
      text: profileText(u),
    }));

    const startDate = fields.startDate ?? new Date();
    const cycleStartDate = fields.startDate ?? new Date();
    const isRecurring = fields.projectType === 'recurring';
    const deadline =
      fields.deadline ??
      (isRecurring && fields.tenureUnit
        ? addTenure(startDate, fields.tenureUnit, fields.tenureValue ?? 1)
        : undefined);

    const project = await this.prisma.project.create({
      data: {
        ...fields,
        startDate,
        cycleStartDate,
        deadline,
        taskTemplate: taskTemplate?.length ? (taskTemplate as any) : undefined,
        ownerId: leadId,
        organizationId,
      },
      include: {
        client: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        tasks: true,
      },
    });

    // Add the creator (or assigned lead) plus any selected team members as project members
    await this.prisma.projectMember.createMany({
      data: [...new Set([leadId, ...memberIds])].map((memberUserId) => ({
        projectId: project.id,
        userId: memberUserId,
      })),
      skipDuplicates: true,
    });

    // Auto-generate the first cycle's tasks. When no team was picked, fall back
    // to ALL approved employees so every task still gets a role-matched assignee.
    let taskAssignees = selectedProfiles;
    if (!taskAssignees.length) {
      const approved = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          OR: [
            { approvedAt: { not: null } },
            { hrApprovedAt: { not: null } },
            { adminApprovedAt: { not: null } },
          ],
        },
        select: MEMBER_USER_SELECT,
        take: 200,
      });
      const approvedProfiles: AssigneeProfile[] = approved.map((u) => ({ id: u.id, text: profileText(u) }));
      taskAssignees = approvedProfiles.length ? approvedProfiles : await this.memberProfiles(project.id);
    }
    const cycleResult = await this.createCycleTasks(project, 1, cycleStartDate, taskTemplate?.length ? taskTemplate : undefined, taskAssignees);

    // Log to audit
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'create',
        resource: 'project',
        resourceId: project.id,
        changes: { project },
      },
    });

    const [withProgress] = await this.withProgress([project]);
    return { ...withProgress, autoAssigned: cycleResult };
  }

  async findAll(query: any, organizationId: string) {
    const { status, clientId, ownerId, search, page = 1, limit = 20 } = query;

    const where: any = {
      organizationId,
    };

    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (ownerId) where.ownerId = ownerId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: {
          client: true,
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          _count: {
            select: { tasks: true },
          },
        },
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.count({ where }),
    ]);

    // Backfill: distribute orphaned (unassigned) tasks across each project's
    // team members so no project task is ever left without an assignee.
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length) {
      const memberRows = await this.prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true },
        distinct: ['projectId'],
      });
      const withMembers = memberRows.map((m) => m.projectId);
      if (withMembers.length) {
        const orphans = await this.prisma.task.findMany({
          where: { projectId: { in: withMembers }, assignees: { none: {} } },
          select: { id: true, projectId: true, title: true },
        });
        const byProject = new Map<string, typeof orphans>();
        for (const t of orphans) {
          const rows = byProject.get(t.projectId!) ?? [];
          rows.push(t);
          byProject.set(t.projectId!, rows);
        }
        for (const [pid, rows] of byProject) {
          const members = await this.distributionPool(pid, organizationId);
          if (!members.length) continue;
          await this.prisma.taskAssignee.createMany({
            data: this.distribute(rows, members).map((r) => ({ taskId: r.taskId, userId: r.userId })),
            skipDuplicates: true,
          });
        }
      }
    }

    const projectsWithProgress = await this.withProgress(projects);
    return {
      projects: projectsWithProgress,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        client: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        tasks: {
          include: {
            assignees: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        milestones: true,
        deliverables: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return { ...project, progress: projectProgress(project.tasks) };
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, user: any, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== user.id && !hasAnyRole(user, PRIVILEGED_ROLES)) {
      throw new ForbiddenException('Only project owner or admin can update the project');
    }

    // Progress is computed from tasks — never accept it as an input
    const { progress: _ignoredProgress, ...safeUpdate } = updateProjectDto as any;
    const updated = await this.prisma.project.update({
      where: { id },
      data: safeUpdate,
      include: {
        client: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Log to audit
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: user.id,
        action: 'update',
        resource: 'project',
        resourceId: id,
        changes: { before: project, after: updated },
      },
    });

    const [withProgress] = await this.withProgress([updated]);
    return withProgress;
  }

  async remove(id: string, user: any, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== user.id && !hasAnyRole(user, PRIVILEGED_ROLES)) {
      throw new ForbiddenException('Only project owner or admin can delete the project');
    }

    await this.prisma.project.delete({
      where: { id },
    });

    // Log to audit
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: user.id,
        action: 'delete',
        resource: 'project',
        resourceId: id,
        changes: { project },
      },
    });

    return { message: 'Project deleted successfully' };
  }

  /**
   * Generate the next recurring cycle. Month-2+ SMM cycles skip Day 1–3
   * onboarding and run Day 4–24 from the new cycle start date.
   */
  async generateNextCycle(id: string, user: any, organizationId: string) {
    const project = await this.prisma.project.findFirst({ where: { id, organizationId } });
    if (!project) throw new NotFoundException('Project not found');
    if (!hasAnyRole(user, MANAGER_ROLES)) {
      throw new ForbiddenException('Only managers can generate a new cycle');
    }
    if (project.projectType !== 'recurring') {
      throw new BadRequestException('Only recurring projects can generate a new cycle');
    }

    const cycle = project.currentCycle + 1;
    const base = project.cycleStartDate ?? project.startDate ?? new Date();
    const nextStart = addTenure(base, project.tenureUnit, project.tenureValue ?? 1);

    const assignees = await this.distributionPool(id, organizationId);
    const cycleResult = await this.createCycleTasks(project, cycle, nextStart, undefined, assignees);
    const created = cycleResult.count;

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        currentCycle: cycle,
        cycleStartDate: nextStart,
        deadline: addTenure(nextStart, project.tenureUnit, project.tenureValue ?? 1),
      },
      include: {
        client: true,
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { tasks: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: user.id,
        action: 'generate_cycle',
        resource: 'project',
        resourceId: id,
        changes: { cycle, tasksCreated: created },
      },
    });

    const [projectWithProgress] = await this.withProgress([updated]);
    return { project: projectWithProgress, cycle, tasksCreated: created };
  }

  /** Distribute all unassigned tasks of a project across its members. Returns count assigned. */
  private async assignUnassignedTasks(projectId: string, organizationId: string): Promise<number> {
    const members = await this.distributionPool(projectId, organizationId);
    if (!members.length) return 0;
    const unassigned = await this.prisma.task.findMany({
      where: { projectId, assignees: { none: {} } },
      orderBy: [{ dayOffset: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true },
    });
    if (!unassigned.length) return 0;
    await this.prisma.taskAssignee.createMany({
      data: this.distribute(unassigned, members).map((r) => ({ taskId: r.taskId, userId: r.userId })),
      skipDuplicates: true,
    });
    return unassigned.length;
  }

  /** One-click "Auto-Assign to Project Team" — owner/manager/admin only. */
  async autoAssign(projectId: string, user: any, organizationId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== user.id && !hasAnyRole(user, MANAGER_ROLES)) {
      throw new ForbiddenException('Only the project lead or a manager can auto-assign tasks');
    }
    const assigned = await this.assignUnassignedTasks(projectId, organizationId);
    return { assigned };
  }

  /** "✨ Smart Auto-Assign by Role" — re-balances ALL project tasks across the
   *  team using role/designation keyword matching with least-loaded balancing. */
  async smartAssign(projectId: string, user: any, organizationId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, organizationId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== user.id && !hasAnyRole(user, MANAGER_ROLES)) {
      throw new ForbiddenException('Only the project lead or a manager can smart-assign tasks');
    }
    const members = await this.distributionPool(projectId, organizationId);
    if (!members.length) return { assigned: 0, byRole: {} };
    const tasks = await this.prisma.task.findMany({
      where: { projectId, status: { not: 'cancelled' } },
      orderBy: [{ dayOffset: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true },
    });
    if (!tasks.length) return { assigned: 0, byRole: {} };

    const rows = this.distribute(tasks, members);
    await this.prisma.taskAssignee.deleteMany({ where: { taskId: { in: tasks.map((t) => t.id) } } });
    await this.prisma.taskAssignee.createMany({
      data: rows.map((r) => ({ taskId: r.taskId, userId: r.userId })),
      skipDuplicates: true,
    });
    const byRole: Record<string, number> = {};
    for (const r of rows) byRole[r.role] = (byRole[r.role] ?? 0) + 1;
    return { assigned: rows.length, byRole };
  }

  async addMember(projectId: string, userId: string, requestingUser: any, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== requestingUser.id && !hasAnyRole(requestingUser, PRIVILEGED_ROLES)) {
      throw new ForbiddenException('Only project owner or admin can add members');
    }

    const member = await this.prisma.projectMember.create({
      data: {
        projectId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // New member joins → immediately distribute any still-unassigned tasks
    const autoAssigned = await this.assignUnassignedTasks(projectId, organizationId);

    return { ...member, autoAssigned };
  }

  async removeMember(projectId: string, userId: string, requestingUser: any, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== requestingUser.id && !hasAnyRole(requestingUser, PRIVILEGED_ROLES)) {
      throw new ForbiddenException('Only project owner or admin can remove members');
    }

    await this.prisma.projectMember.deleteMany({
      where: {
        projectId,
        userId,
      },
    });

    return { message: 'Member removed successfully' };
  }
}
