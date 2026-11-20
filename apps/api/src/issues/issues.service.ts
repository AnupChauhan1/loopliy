import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { NotificationsService } from '../notifications/notifications.service';

const ISSUE_INCLUDE = {
  project: { select: { id: true, name: true } },
  template: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true } },
  createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
  attachments: true,
  comments: {
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  activities: {
    orderBy: { createdAt: 'desc' as const },
  },
};

const VALID_STATUSES = ['open', 'in_progress', 'ignore', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

@Injectable()
export class IssuesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async logActivity(issueId: string, action: string, userId: string, changes?: any) {
    await this.prisma.issueActivity.create({
      data: { issueId, action, changedBy: userId, changes },
    });
  }

  async create(dto: CreateIssueDto, user: any) {
    const organizationId = user.organizationId;
    
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project || project.organizationId !== organizationId) {
        throw new ForbiddenException('Invalid project or access denied');
      }
    }
    
    if (dto.templateId) {
      const template = await this.prisma.issueTemplate.findUnique({ where: { id: dto.templateId } });
      if (!template || template.organizationId !== organizationId) {
        throw new ForbiddenException('Invalid template or access denied');
      }
    }

    const issue = await this.prisma.issue.create({
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        createdById: user.id,
        organizationId,
        status: dto.status || 'open',
        priority: dto.priority || 'medium',
      },
      include: ISSUE_INCLUDE,
    });

    await this.logActivity(issue.id, 'created', user.id);

    // TODO: Re-enable notifications after fixing notification service
    // if (dto.assignedToId && dto.assignedToId !== user.id) {
    //   await this.notifications.notify(dto.assignedToId, 'issue_assigned', 'New Issue Assigned', `You have been assigned to issue: ${issue.title}`, `/issues/${issue.id}`);
    // }

    return issue;
  }

  async findAll(query: any, user: any) {
    const organizationId = user.organizationId;
    const {
      status,
      priority,
      projectId,
      assignedToId,
      teamId,
      category,
      search,
      dueDateFrom,
      dueDateTo,
      limit = 50,
      offset = 0,
    } = query;

    const where: any = { organizationId };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (projectId) where.projectId = projectId;
    if (assignedToId) where.assignedToId = assignedToId;
    if (teamId) where.teamId = teamId;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) where.dueDate.gte = new Date(dueDateFrom);
      if (dueDateTo) where.dueDate.lte = new Date(dueDateTo);
    }

    const [issues, total] = await Promise.all([
      this.prisma.issue.findMany({
        where,
        include: ISSUE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      this.prisma.issue.count({ where }),
    ]);

    return { issues, total, limit: Number(limit), offset: Number(offset) };
  }

  async findMyIssues(query: any, user: any) {
    return this.findAll({ ...query, assignedToId: user.id }, user);
  }

  async categories(organizationId: string) {
    const issues = await this.prisma.issue.findMany({
      where: { organizationId },
      select: { category: true },
      distinct: ['category'],
    });
    return issues.map((i) => i.category).filter(Boolean);
  }

  async findOne(id: string, organizationId: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      include: ISSUE_INCLUDE,
    });
    if (!issue) throw new NotFoundException('Issue not found');
    if (issue.organizationId !== organizationId) {
      throw new ForbiddenException('Access denied');
    }
    return issue;
  }

  async update(id: string, dto: UpdateIssueDto, user: any) {
    const organizationId = user.organizationId;
    const existing = await this.findOne(id, organizationId);

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project || project.organizationId !== organizationId) {
        throw new ForbiddenException('Invalid project or access denied');
      }
    }

    const changes: any = {};
    if (dto.status && dto.status !== existing.status) {
      changes.status = { from: existing.status, to: dto.status };
    }
    if (dto.assignedToId && dto.assignedToId !== existing.assignedToId) {
      changes.assignedTo = { from: existing.assignedToId, to: dto.assignedToId };
    }

    const issue = await this.prisma.issue.update({
      where: { id },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: ISSUE_INCLUDE,
    });

    await this.logActivity(id, 'updated', user.id, changes);

    // TODO: Re-enable notifications after fixing notification service
    // if (dto.status === 'closed' && existing.status !== 'closed') {
    //   if (existing.assignedToId) {
    //     await this.notifications.notify(existing.assignedToId, 'issue_closed', 'Issue Closed', `Issue "${issue.title}" has been closed`, `/issues/${issue.id}`);
    //   }
    // }

    return issue;
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    await this.prisma.issue.delete({ where: { id } });
    return { message: 'Issue deleted successfully' };
  }

  async addComment(id: string, content: string, user: any) {
    const issue = await this.findOne(id, user.organizationId);
    
    const comment = await this.prisma.issueComment.create({
      data: {
        issueId: id,
        userId: user.id,
        content,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    await this.logActivity(id, 'commented', user.id);

    // TODO: Re-enable notifications after fixing notification service
    // if (issue.createdById !== user.id) {
    //   await this.notifications.notify(issue.createdById, 'issue_comment', 'New Comment on Your Issue', `${user.firstName} commented on "${issue.title}"`, `/issues/${issue.id}`);
    // }

    return comment;
  }

  async addAttachment(id: string, dto: { name: string; url: string; size?: number; mimeType?: string }, user: any) {
    await this.findOne(id, user.organizationId);
    
    const attachment = await this.prisma.issueAttachment.create({
      data: {
        issueId: id,
        ...dto,
        uploadedBy: user.id,
      },
    });

    await this.logActivity(id, 'attachment_added', user.id, { attachmentId: attachment.id });

    return attachment;
  }

  async updateStatus(id: string, status: string, user: any) {
    if (!VALID_STATUSES.includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    return this.update(id, { status }, user);
  }

  async bulkUpdate(ids: string[], updates: Partial<UpdateIssueDto>, user: any) {
    const organizationId = user.organizationId;
    
    const issues = await this.prisma.issue.findMany({
      where: { id: { in: ids }, organizationId },
    });

    if (issues.length !== ids.length) {
      throw new ForbiddenException('Some issues not found or access denied');
    }

    const updated = await this.prisma.issue.updateMany({
      where: { id: { in: ids } },
      data: updates,
    });

    for (const id of ids) {
      await this.logActivity(id, 'bulk_updated', user.id, updates);
    }

    return { updated: updated.count };
  }
}
