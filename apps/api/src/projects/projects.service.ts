import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

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

    const project = await this.prisma.project.create({
      data: {
        ...createProjectDto,
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
      data: updateProjectDto,
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
