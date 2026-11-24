import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { SMM_CYCLE_1, SMM_CYCLE_2_PLUS, TemplateTaskSpec, addDays, addTenure, dueDateFor } from './smm-template';
import { hasAnyRole, MANAGER_ROLES } from '../common/roles';

const TASK_INCLUDE = {
  assignees: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
};

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

  private async createCycleTasks(
    project: { id: string; organizationId: string; service?: string | null; planStructure?: string | null; projectType?: string | null; taskTemplate?: any; currentCycle?: number | null },
    cycle: number,
    cycleStart: Date,
    provided?: TemplateTaskSpec[],
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

    const { taskTemplate, ...fields } = createProjectDto;
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
        ownerId: userId,
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

    // Add the creator as a project member
    await this.prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId,
      },
    });

    // Auto-generate the first cycle's tasks (SMM fixed template or custom day-offset tasks)
    await this.createCycleTasks(project, 1, cycleStartDate, taskTemplate?.length ? taskTemplate : undefined);

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

    return project;
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

    return {
      projects,
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

    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, userId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only project owner can update the project');
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: updateProjectDto as any,
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
        userId,
        action: 'update',
        resource: 'project',
        resourceId: id,
        changes: { before: project, after: updated },
      },
    });

    return updated;
  }

  async remove(id: string, userId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only project owner can delete the project');
    }

    await this.prisma.project.delete({
      where: { id },
    });

    // Log to audit
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId,
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

    const created = await this.createCycleTasks(project, cycle, nextStart);

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

    return { project: updated, cycle, tasksCreated: created };
  }

  async addMember(projectId: string, userId: string, requestingUserId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== requestingUserId) {
      throw new ForbiddenException('Only project owner can add members');
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

    return member;
  }

  async removeMember(projectId: string, userId: string, requestingUserId: string, organizationId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== requestingUserId) {
      throw new ForbiddenException('Only project owner can remove members');
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
