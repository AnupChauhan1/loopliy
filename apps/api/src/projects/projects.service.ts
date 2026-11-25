import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { SMM_CYCLE_1, SMM_CYCLE_2_PLUS, TemplateTaskSpec, addDays, addTenure, dueDateFor } from './smm-template';
import { hasAnyRole, MANAGER_ROLES, PRIVILEGED_ROLES } from '../common/roles';
import { projectProgress, projectProgressFromGroups } from '../common/progress';

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

  /**
   * Smart distribution: match task-type keywords (reel/video → video editors,
   * static/carousel → designers, onboarding/reporting → managers) and fall
   * back to even round-robin across the pool.
   */
  private pickAssignee(title: string, members: AssigneeProfile[], index: number): string {
    const t = title.toLowerCase();
    let pool = members;
    const narrow = (re: RegExp) => {
      const m = members.filter((x) => re.test(x.text));
      if (m.length) pool = m;
    };
    if (/reel|video|motion|short|edit/.test(t)) narrow(/video|reel|editor|motion/);
    else if (/static|carousel|post|graphic|design|thumbnail|banner|creative|template/.test(t)) narrow(/design|creative|graphic|visual/);
    else if (/onboard|setup|call|calendar|report|strategy|form|audit|plan|meeting|intro|kickoff/.test(t)) narrow(/manager|account|lead|project|strategy|coordinator|ops/);
    return pool[index % pool.length].id;
  }

  private async createCycleTasks(
    project: { id: string; organizationId: string; service?: string | null; planStructure?: string | null; projectType?: string | null; taskTemplate?: any; currentCycle?: number | null },
    cycle: number,
    cycleStart: Date,
    provided?: TemplateTaskSpec[],
    assignees?: AssigneeProfile[],
  ) {
    const specs = this.specsFor(project, cycle, provided);
    if (!specs.length) return 0;
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
    // Auto-assign every generated task across the project's team (round-robin
    // with role/dept keyword matching). One member → all tasks to them.
    if (assignees?.length) {
      const created = await this.prisma.task.findMany({
        where: { projectId: project.id, cycle },
        orderBy: [{ dayOffset: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true },
      });
      if (created.length) {
        await this.prisma.taskAssignee.createMany({
          data: created.map((t, i) => ({
            taskId: t.id,
            userId: this.pickAssignee(t.title, assignees, i),
          })),
          skipDuplicates: true,
        });
      }
    }
    return specs.length;
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

    // Auto-generate the first cycle's tasks (SMM fixed template or custom day-offset tasks).
    // Every generated task is auto-assigned across the selected team (round-robin
    // with role matching); falls back to all project members when none were picked.
    const taskAssignees = selectedProfiles.length ? selectedProfiles : await this.memberProfiles(project.id);
    await this.createCycleTasks(project, 1, cycleStartDate, taskTemplate?.length ? taskTemplate : undefined, taskAssignees);

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
    return withProgress;
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

    const assignees = await this.memberProfiles(id);
    const created = await this.createCycleTasks(project, cycle, nextStart, undefined, assignees);

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
  private async assignUnassignedTasks(projectId: string): Promise<number> {
    const members = await this.memberProfiles(projectId);
    if (!members.length) return 0;
    const unassigned = await this.prisma.task.findMany({
      where: { projectId, assignees: { none: {} } },
      orderBy: [{ dayOffset: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true },
    });
    if (!unassigned.length) return 0;
    await this.prisma.taskAssignee.createMany({
      data: unassigned.map((t, i) => ({
        taskId: t.id,
        userId: this.pickAssignee(t.title, members, i),
      })),
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
    const assigned = await this.assignUnassignedTasks(projectId);
    return { assigned };
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
    const autoAssigned = await this.assignUnassignedTasks(projectId);

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
