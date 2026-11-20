import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Put, Query, Request, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { basename, extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, MANAGER_ROLES, PRIVILEGED_ROLES, hasAnyRole } from '../common/roles';
import { NotificationsService } from '../notifications/notifications.service';

const creativeUploadDirectory = join(process.cwd(), 'creative-uploads');
mkdirSync(creativeUploadDirectory, { recursive: true });

const uploadStorage = diskStorage({
  destination: creativeUploadDirectory,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});
const ALLOWED_CREATIVE_FILES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  'application/pdf': ['.pdf'],
  'application/octet-stream': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov'],
};

function creativeFileFilter(_req: unknown, file: { mimetype: string; originalname: string }, callback: (error: Error | null, acceptFile: boolean) => void) {
  const extension = extname(file.originalname).toLowerCase();
  if (!ALLOWED_CREATIVE_FILES[file.mimetype]?.includes(extension)) {
    callback(new BadRequestException('Supported files are JPG, PNG, WebP, GIF, MP4, WebM, MOV, and PDF.'), false);
    return;
  }
  callback(null, true);
}

function removeCreativeUpload(filename?: string) {
  if (!filename) return;
  const safeName = basename(filename);
  const filePath = join(creativeUploadDirectory, safeName);
  if (existsSync(filePath)) unlinkSync(filePath);
}

export const CREATIVE_STATUSES = [
  'draft',
  'submitted_strategy',
  'strategy_changes_requested',
  'strategy_rejected',
  'pending_manager',
  'manager_changes_requested',
  'manager_rejected',
  'final_approved',
  'delivered',
  'cancelled',
];
const STRATEGY_APPROVER_ROLES = ['Strategy Approver'];
const CREATIVE_TYPES = ['graphic', 'video', 'banner', 'ad', 'social_media', 'other'];

@Injectable()
export class CreativesService {
  constructor(
    protected prisma: PrismaService,
    protected notifications: NotificationsService,
  ) {}

  protected model(): any { return this.prisma.creativeRequest; }
  protected versionModel(): any { return this.prisma.creativeVersion; }
  protected notifPrefix() { return 'creative'; }

  isManager(user: any) { return hasAnyRole(user, MANAGER_ROLES); }

  private creativeScope(user: any) {
    return {
      organizationId: user.organizationId,
      ...(this.isManager(user)
        ? {}
        : {
          OR: [
            { createdById: user.id },
            { assigneeId: user.id },
            { strategyApproverId: user.id },
            { managerApproverId: user.id },
          ],
        }),
    };
  }

  private async validateApprover(id: string | undefined, organizationId: string, roles: string[], label: string) {
    if (!id) return null;
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        isActive: true,
        roles: { some: { role: { name: { in: roles } } } },
      },
      select: { id: true },
    });
    if (!user) throw new BadRequestException(`${label} must be an active user with an authorized approval role.`);
    return user.id;
  }

  private async validateClientAndProject(clientId: string | undefined, projectId: string | undefined, organizationId: string) {
    const project = projectId
      ? await this.prisma.project.findFirst({
        where: { id: projectId, organizationId },
        select: { id: true, clientId: true },
      })
      : null;
    if (projectId && !project) throw new BadRequestException('Project not found in this organization.');
    const resolvedClientId = clientId || project?.clientId || null;
    if (resolvedClientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: resolvedClientId, organizationId },
        select: { id: true },
      });
      if (!client) throw new BadRequestException('Client not found in this organization.');
    }
    if (clientId && project?.clientId && clientId !== project.clientId) {
      throw new BadRequestException('The selected client does not own the selected project.');
    }
    return { clientId: resolvedClientId, projectId: project?.id ?? null };
  }

  private validateExternalUrl(value?: string) {
    if (!value?.trim()) return null;
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      return url.toString();
    } catch {
      throw new BadRequestException('Creative links must use http or https.');
    }
  }

  async creativeDetail(id: string, user: any) {
    const item = await this.prisma.creativeRequest.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        client: { select: { id: true, name: true, website: true } },
        project: { select: { id: true, name: true, clientId: true } },
        department: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        strategyApprover: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        managerApprover: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        versions: { orderBy: { version: 'desc' } },
        approvalEvents: {
          include: {
            actor: { select: { id: true, firstName: true, lastName: true, avatar: true } },
            version: { select: { id: true, version: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Creative not found.');
    if (
      !this.isManager(user) &&
      ![item.createdById, item.assigneeId, item.strategyApproverId, item.managerApproverId].includes(user.id)
    ) {
      throw new ForbiddenException('You do not have access to this creative.');
    }
    return item;
  }

  async sendCreativeFile(requestId: string, versionId: string, user: any, response: Response) {
    await this.creativeDetail(requestId, user);
    const version = await this.prisma.creativeVersion.findFirst({
      where: { id: versionId, requestId },
      select: { fileUrl: true, fileName: true, mimeType: true },
    });
    if (!version?.fileUrl?.startsWith('private:')) throw new NotFoundException('Creative file not found.');
    const storedName = version.fileUrl.slice('private:'.length);
    if (!storedName || basename(storedName) !== storedName) throw new NotFoundException('Creative file not found.');
    const filePath = join(creativeUploadDirectory, storedName);
    if (!existsSync(filePath)) throw new NotFoundException('Creative file not found.');
    const downloadName = basename(version.fileName || storedName).replace(/[\r\n"]/g, '_');
    response.setHeader('Content-Type', version.mimeType || 'application/octet-stream');
    response.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.sendFile(filePath);
  }

  async listCreatives(user: any, query: any) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit, 10) || 50));
    const where: any = this.creativeScope(user);
    if (query.status && query.status !== 'all') {
      if (query.status === 'changes_requested') {
        where.status = { in: ['strategy_changes_requested', 'manager_changes_requested'] };
      } else if (query.status === 'rejected') {
        where.status = { in: ['strategy_rejected', 'manager_rejected'] };
      } else if (query.status === 'approved') {
        where.status = { in: ['final_approved', 'delivered'] };
      } else {
        if (!CREATIVE_STATUSES.includes(query.status)) throw new BadRequestException('Invalid creative approval status.');
        where.status = query.status;
      }
    }
    if (query.search) {
      const search = String(query.search).trim().slice(0, 100);
      if (search) {
        where.AND = [...(where.AND ?? []), {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { brief: { contains: search, mode: 'insensitive' } },
            { campaign: { contains: search, mode: 'insensitive' } },
            { client: { name: { contains: search, mode: 'insensitive' } } },
            { project: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }];
      }
    }
    const [items, total] = await Promise.all([
      this.prisma.creativeRequest.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
          _count: { select: { versions: true, approvalEvents: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.creativeRequest.count({ where }),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async creativeDashboard(user: any) {
    const where = this.creativeScope(user);
    const [total, pendingStrategy, pendingManager, changesRequested, rejected, finalApproved] = await Promise.all([
      this.prisma.creativeRequest.count({ where }),
      this.prisma.creativeRequest.count({ where: { ...where, status: 'submitted_strategy' } }),
      this.prisma.creativeRequest.count({ where: { ...where, status: 'pending_manager' } }),
      this.prisma.creativeRequest.count({ where: { ...where, status: { in: ['strategy_changes_requested', 'manager_changes_requested'] } } }),
      this.prisma.creativeRequest.count({ where: { ...where, status: { in: ['strategy_rejected', 'manager_rejected'] } } }),
      this.prisma.creativeRequest.count({ where: { ...where, status: { in: ['final_approved', 'delivered'] } } }),
    ]);
    return { total, pendingStrategy, pendingManager, changesRequested, rejected, finalApproved };
  }

  async creativeApprovers(organizationId: string) {
    const select = {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      roles: { select: { role: { select: { name: true } } } },
    };
    const [strategyApprovers, managerApprovers] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          roles: { some: { role: { name: { in: [...STRATEGY_APPROVER_ROLES, ...PRIVILEGED_ROLES] } } } },
        },
        select,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          roles: { some: { role: { name: { in: MANAGER_ROLES } } } },
        },
        select,
        orderBy: { firstName: 'asc' },
      }),
    ]);
    return { strategyApprovers, managerApprovers };
  }

  async creativeResources(organizationId: string) {
    const [clients, projects, assignees] = await Promise.all([
      this.prisma.client.findMany({
        where: { organizationId, status: 'active' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.project.findMany({
        where: { organizationId, status: { notIn: ['cancelled', 'archived'] } },
        select: { id: true, name: true, clientId: true, client: { select: { name: true } } },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      this.prisma.user.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } },
        orderBy: { firstName: 'asc' },
        take: 250,
      }),
    ]);
    return { clients, projects, assignees };
  }

  async createCreative(data: any, user: any, file?: any) {
    const title = typeof data.title === 'string' ? data.title.trim().slice(0, 200) : '';
    if (!title) throw new BadRequestException('Creative title is required.');
    const creativeType = data.creativeType || 'graphic';
    if (!CREATIVE_TYPES.includes(creativeType)) throw new BadRequestException('Invalid creative type.');
    const priority = data.priority || 'medium';
    if (!['low', 'medium', 'high', 'urgent'].includes(priority)) throw new BadRequestException('Invalid priority.');
    const [strategyApproverId, managerApproverId] = await Promise.all([
      this.validateApprover(data.strategyApproverId, user.organizationId, [...STRATEGY_APPROVER_ROLES, ...PRIVILEGED_ROLES], 'Strategy approver'),
      this.validateApprover(data.managerApproverId, user.organizationId, MANAGER_ROLES, 'Manager approver'),
    ]);
    if (strategyApproverId && strategyApproverId === managerApproverId) {
      throw new BadRequestException('Strategy and manager approvals must be assigned to different people.');
    }
    const assigneeId = data.assigneeId || user.id;
    const assignee = await this.prisma.user.findFirst({
      where: { id: assigneeId, organizationId: user.organizationId, isActive: true },
      select: { id: true },
    });
    if (!assignee) throw new BadRequestException('Assigned creative team member must be active in this organization.');
    const { clientId, projectId } = await this.validateClientAndProject(data.clientId, data.projectId, user.organizationId);
    const deadline = data.deadline ? new Date(data.deadline) : null;
    if (deadline && Number.isNaN(deadline.getTime())) throw new BadRequestException('Invalid deadline.');
    const sourceLink = this.validateExternalUrl(data.sourceLink || data.externalUrl);
    const submissionNotes = typeof data.submissionNotes === 'string' ? data.submissionNotes.trim().slice(0, 5000) : null;
    const isSubmitted = !!file || !!sourceLink;
    if (isSubmitted && (!strategyApproverId || !managerApproverId)) {
      throw new BadRequestException('Assign both a strategy approver and a manager before submitting.');
    }
    const { item, version } = await this.prisma.$transaction(async (tx) => {
      const request = await tx.creativeRequest.create({
        data: {
          title,
          brief: typeof data.brief === 'string' ? data.brief.trim().slice(0, 5000) : null,
          dimensions: data.dimensions || null,
          format: data.format || null,
          creativeType,
          campaign: data.campaign?.trim()?.slice(0, 200) || null,
          sourceLink,
          requirements: data.requirements?.trim()?.slice(0, 5000) || null,
          submissionNotes,
          priority,
          deadline,
          projectId,
          clientId,
          departmentId: data.departmentId || null,
          taskId: data.taskId || null,
          assigneeId,
          strategyApproverId,
          managerApproverId,
          reviewerId: managerApproverId,
          referenceLinks: data.referenceLinks,
          status: isSubmitted ? 'submitted_strategy' : 'draft',
          organizationId: user.organizationId,
          createdById: user.id,
        },
      });
      if (!isSubmitted) return { item: request, version: null };
      const uploadedVersion = await tx.creativeVersion.create({
        data: {
          requestId: request.id,
          version: 1,
          fileUrl: file ? `private:${file.filename}` : null,
          fileName: file?.originalname ?? null,
          mimeType: file?.mimetype ?? null,
          size: file?.size ?? null,
          externalUrl: sourceLink,
          notes: submissionNotes,
          status: 'submitted',
          uploadedById: user.id,
        },
      });
      await tx.creativeApprovalEvent.create({
        data: {
          requestId: request.id,
          versionId: uploadedVersion.id,
          actorId: user.id,
          actorName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
          stage: 'submission',
          action: 'submitted',
          message: submissionNotes,
        },
      });
      return { item: request, version: uploadedVersion };
    });
    if (assigneeId !== user.id) {
      await this.notifications.notify(
        assigneeId,
        'creative_assigned',
        'New creative request',
        `"${item.title}" was assigned to you`,
        '/creative',
      );
    }
    if (version && strategyApproverId !== user.id) {
      await this.notifications.notify(
        strategyApproverId!,
        'creative_submitted_strategy',
        'Creative submitted for strategy approval',
        `"${item.title}" v${version.version} is awaiting strategy approval.`,
        '/creative',
      );
    }
    return this.creativeDetail(item.id, user);
  }

  async updateCreative(id: string, data: any, user: any) {
    const item = await this.creativeDetail(id, user);
    const manager = this.isManager(user);
    if (!manager && item.createdById !== user.id && item.assigneeId !== user.id) {
      throw new ForbiddenException('Only the creative team or a manager can edit this request.');
    }
    if (!manager && (data.strategyApproverId !== undefined || data.managerApproverId !== undefined)) {
      throw new ForbiddenException('Only a manager can change approval assignments.');
    }
    const changes: any = {};
    for (const field of ['title', 'brief', 'dimensions', 'format', 'creativeType', 'campaign', 'requirements', 'submissionNotes', 'priority', 'deadline', 'assigneeId', 'departmentId', 'taskId']) {
      if (data[field] !== undefined) changes[field] = data[field];
    }
    if (data.title !== undefined) {
      changes.title = String(data.title).trim().slice(0, 200);
      if (!changes.title) throw new BadRequestException('Creative title is required.');
    }
    if (data.creativeType !== undefined && !CREATIVE_TYPES.includes(data.creativeType)) {
      throw new BadRequestException('Invalid creative type.');
    }
    if (data.priority !== undefined && !['low', 'medium', 'high', 'urgent'].includes(data.priority)) {
      throw new BadRequestException('Invalid priority.');
    }
    if (data.deadline !== undefined) {
      changes.deadline = data.deadline ? new Date(data.deadline) : null;
      if (changes.deadline && Number.isNaN(changes.deadline.getTime())) throw new BadRequestException('Invalid deadline.');
    }
    if (data.sourceLink !== undefined) changes.sourceLink = this.validateExternalUrl(data.sourceLink);
    if (data.clientId !== undefined || data.projectId !== undefined) {
      const linked = await this.validateClientAndProject(
        data.clientId !== undefined ? data.clientId : item.clientId,
        data.projectId !== undefined ? data.projectId : item.projectId,
        user.organizationId,
      );
      Object.assign(changes, linked);
    }
    if (data.assigneeId !== undefined) {
      if (data.assigneeId) {
        const assignee = await this.prisma.user.findFirst({
          where: { id: data.assigneeId, organizationId: user.organizationId, isActive: true },
          select: { id: true },
        });
        if (!assignee) throw new BadRequestException('Assigned creative team member must be active in this organization.');
      }
      changes.assigneeId = data.assigneeId || null;
    }
    if (manager && data.strategyApproverId !== undefined) {
      changes.strategyApproverId = await this.validateApprover(
        data.strategyApproverId,
        user.organizationId,
        [...STRATEGY_APPROVER_ROLES, ...PRIVILEGED_ROLES],
        'Strategy approver',
      );
    }
    if (manager && data.managerApproverId !== undefined) {
      changes.managerApproverId = await this.validateApprover(data.managerApproverId, user.organizationId, MANAGER_ROLES, 'Manager approver');
      changes.reviewerId = changes.managerApproverId;
    }
    const nextStrategyApproverId = changes.strategyApproverId !== undefined ? changes.strategyApproverId : item.strategyApproverId;
    const nextManagerApproverId = changes.managerApproverId !== undefined ? changes.managerApproverId : item.managerApproverId;
    if (nextStrategyApproverId && nextStrategyApproverId === nextManagerApproverId) {
      throw new BadRequestException('Strategy and manager approvals must be assigned to different people.');
    }
    const assignmentChanged =
      changes.strategyApproverId !== undefined && changes.strategyApproverId !== item.strategyApproverId ||
      changes.managerApproverId !== undefined && changes.managerApproverId !== item.managerApproverId;
    await this.prisma.$transaction(async (tx) => {
      await tx.creativeRequest.update({ where: { id }, data: changes });
      if (assignmentChanged) {
        const parts = [];
        if (changes.strategyApproverId !== undefined && changes.strategyApproverId !== item.strategyApproverId) parts.push('Strategy approver assignment updated.');
        if (changes.managerApproverId !== undefined && changes.managerApproverId !== item.managerApproverId) parts.push('Manager approver assignment updated.');
        await tx.creativeApprovalEvent.create({
          data: {
            requestId: id,
            actorId: user.id,
            actorName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
            stage: 'administration',
            action: 'assignment_changed',
            message: parts.join(' '),
          },
        });
      }
    });
    if (changes.assigneeId && changes.assigneeId !== item.assigneeId) {
      await this.notifications.notify(
        changes.assigneeId,
        'creative_assigned',
        'Creative request assigned to you',
        `"${item.title}" is assigned to you.`,
        '/creative',
      );
    }
    if (changes.strategyApproverId && changes.strategyApproverId !== item.strategyApproverId && item.status === 'submitted_strategy') {
      await this.notifications.notify(
        changes.strategyApproverId,
        'creative_submitted_strategy',
        'Creative awaiting strategy approval',
        `"${item.title}" is awaiting your strategy review.`,
        '/creative',
      );
    }
    if (changes.managerApproverId && changes.managerApproverId !== item.managerApproverId && item.status === 'pending_manager') {
      await this.notifications.notify(
        changes.managerApproverId,
        'creative_pending_manager',
        'Creative awaiting manager approval',
        `"${item.title}" is awaiting your final review.`,
        '/creative',
      );
    }
    return this.creativeDetail(id, user);
  }

  async uploadCreativeVersion(
    id: string,
    file: { fileUrl?: string; externalUrl?: string; fileName?: string; mimeType?: string; size?: number; notes?: string },
    user: any,
  ) {
    const item = await this.creativeDetail(id, user);
    if (!this.isManager(user) && item.assigneeId !== user.id && item.createdById !== user.id) {
      throw new ForbiddenException('Only the creative team assigned to this request can upload a version.');
    }
    if (!file.fileUrl && !file.externalUrl) throw new BadRequestException('Upload a creative file or provide a creative link.');
    if (!item.strategyApproverId || !item.managerApproverId) {
      throw new BadRequestException('Assign both a strategy approver and a manager before submitting.');
    }
    if (item.strategyApproverId === item.managerApproverId) {
      throw new BadRequestException('Strategy and manager approvals must be assigned to different people.');
    }
    const editableStatuses = [
      'draft',
      'strategy_changes_requested',
      'strategy_rejected',
      'manager_changes_requested',
      'manager_rejected',
      'final_approved',
      'delivered',
    ];
    if (!editableStatuses.includes(item.status)) {
      throw new ConflictException('This creative is already under review. Wait for an approval action before uploading another version.');
    }
    const externalUrl = this.validateExternalUrl(file.externalUrl);
    const version = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.creativeVersion.findFirst({
        where: { requestId: id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const next = await tx.creativeVersion.create({
        data: {
          requestId: id,
          version: (previous?.version ?? 0) + 1,
          fileUrl: file.fileUrl?.startsWith('/uploads/')
            ? `private:${basename(file.fileUrl)}`
            : file.fileUrl,
          externalUrl,
          fileName: file.fileName,
          mimeType: file.mimeType,
          size: file.size,
          notes: file.notes?.trim()?.slice(0, 2000) || null,
          status: 'submitted',
          uploadedById: user.id,
        },
      });
      await tx.creativeRequest.update({
        where: { id },
        data: { status: 'submitted_strategy', finalVersionId: null },
      });
      await tx.creativeApprovalEvent.create({
        data: {
          requestId: id,
          versionId: next.id,
          actorId: user.id,
          actorName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
          stage: 'submission',
          action: 'submitted',
          message: file.notes?.trim()?.slice(0, 2000) || item.submissionNotes,
        },
      });
      return next;
    });
    await this.notifications.notifyMany(
      [item.strategyApproverId].filter((target): target is string => !!target && target !== user.id),
      'creative_submitted_strategy',
      'Creative submitted for strategy approval',
      `"${item.title}" v${version.version} is awaiting strategy approval.`,
      `/creative`,
    );
    return version;
  }

  async reviewCreativeStage(
    requestId: string,
    versionId: string,
    action: 'approve' | 'reject' | 'changes',
    message: string | undefined,
    user: any,
  ) {
    if (!['approve', 'reject', 'changes'].includes(action)) throw new BadRequestException('Invalid approval action.');
    const item = await this.creativeDetail(requestId, user);
    const stage = item.status === 'submitted_strategy'
      ? 'strategy'
      : item.status === 'pending_manager'
        ? 'manager'
        : null;
    if (!stage) throw new ConflictException('This creative is not awaiting an approval decision.');
    if (stage === 'strategy') {
      if (item.strategyApproverId !== user.id || !hasAnyRole(user, [...STRATEGY_APPROVER_ROLES, ...PRIVILEGED_ROLES])) {
        throw new ForbiddenException('Only the assigned strategy approver can complete this stage.');
      }
    } else if (item.managerApproverId !== user.id || !this.isManager(user)) {
      throw new ForbiddenException('Only the assigned manager can complete this stage.');
    }
    if (
      [item.createdById, item.assigneeId].includes(user.id) &&
      !hasAnyRole(user, PRIVILEGED_ROLES)
    ) {
      throw new ForbiddenException('Creative team members cannot approve their own work.');
    }
    const latestVersion = item.versions[0];
    if (!latestVersion || latestVersion.id !== versionId || latestVersion.status !== 'submitted') {
      throw new ConflictException('Only the current version can be reviewed.');
    }
    const feedback = typeof message === 'string' ? message.trim().slice(0, 2000) : '';
    if (action !== 'approve' && !feedback) {
      throw new BadRequestException('A message is required when rejecting or requesting changes.');
    }

    const nextStatus = stage === 'strategy'
      ? action === 'approve' ? 'pending_manager' : action === 'changes' ? 'strategy_changes_requested' : 'strategy_rejected'
      : action === 'approve' ? 'final_approved' : action === 'changes' ? 'manager_changes_requested' : 'manager_rejected';
    const versionStatus = action === 'approve' && stage === 'manager'
      ? 'approved'
      : action === 'approve'
        ? 'submitted'
        : action === 'changes'
          ? 'changes_requested'
          : 'rejected';
    const now = new Date();
    const approverName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Approver';
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.creativeRequest.updateMany({
        where: { id: requestId, organizationId: user.organizationId, status: item.status },
        data: {
          status: nextStatus,
          ...(nextStatus === 'final_approved' ? { finalVersionId: versionId } : {}),
        },
      });
      if (claimed.count !== 1) throw new ConflictException('Another approval action has already been recorded.');
      await tx.creativeVersion.update({
        where: { id: versionId },
        data: { status: versionStatus, feedback: feedback || null, reviewedById: user.id, reviewedAt: now },
      });
      await tx.creativeApprovalEvent.create({
        data: {
          requestId,
          versionId,
          actorId: user.id,
          actorName: approverName,
          stage,
          action,
          message: feedback || null,
          createdAt: now,
        },
      });
    });

    const outcome = action === 'approve' ? 'approved' : action === 'changes' ? 'requested changes on' : 'rejected';
    const messageText = `"${item.title}" v${latestVersion.version} was ${outcome} by ${approverName}${feedback ? `: ${feedback}` : '.'}`;
    if (stage === 'strategy' && action === 'approve') {
      await this.notifications.notifyMany(
        [item.managerApproverId].filter((target): target is string => !!target && target !== user.id),
        'creative_pending_manager',
        'Creative awaiting manager approval',
        messageText,
        '/creative',
      );
    } else {
      const targets = [...new Set([item.assigneeId, item.createdById].filter((target): target is string => !!target && target !== user.id))];
      await this.notifications.notifyMany(
        targets,
        `creative_${action === 'approve' ? 'final_approved' : action === 'changes' ? 'changes_requested' : 'rejected'}`,
        `Creative ${outcome}`,
        messageText,
        '/creative',
      );
    }
    return this.creativeDetail(requestId, user);
  }

  async markCreativeDelivered(id: string, user: any) {
    if (!this.isManager(user)) throw new ForbiddenException('Only managers can mark delivered.');
    const item = await this.creativeDetail(id, user);
    if (!['final_approved', 'approved'].includes(item.status)) {
      throw new BadRequestException('Only a finally approved creative can be delivered.');
    }
    return this.prisma.creativeRequest.update({ where: { id }, data: { status: 'delivered' } });
  }

  async removeCreative(id: string, user: any) {
    if (!this.isManager(user)) throw new ForbiddenException('Only managers can delete requests.');
    const item = await this.creativeDetail(id, user);
    if (item.approvalEvents.length > 0) {
      throw new ConflictException('A creative with approval history cannot be deleted.');
    }
    await this.prisma.creativeRequest.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async list(organizationId: string, query: any, user: any) {
    const { status, departmentId, assigneeId, search, page = 1, limit = 50 } = query;
    const where: any = { organizationId };
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (search) where.OR = [{ title: { contains: search, mode: 'insensitive' } }, { brief: { contains: search, mode: 'insensitive' } }];
    // Non-managers only see items they created or are assigned to
    if (!this.isManager(user)) {
      where.AND = [{ OR: [{ assigneeId: user.id }, { createdById: user.id }] }];
    }
    const [items, total] = await Promise.all([
      this.model().findMany({
        where,
        include: { department: { select: { id: true, name: true, color: true } }, versions: { orderBy: { version: 'desc' }, take: 1 }, _count: { select: { versions: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      this.model().count({ where }),
    ]);
    return { items, pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) } };
  }

  async detail(id: string, organizationId: string) {
    const item = await this.model().findFirst({
      where: { id, organizationId },
      include: { department: true, versions: { orderBy: { version: 'desc' } } },
    });
    if (!item) throw new NotFoundException('Request not found');
    return item;
  }

  async create(data: any, user: any) {
    const item = await this.model().create({
      data: {
        title: data.title,
        brief: data.brief,
        dimensions: data.dimensions,
        format: data.format,
        requirements: data.requirements,
        sourceLink: data.sourceLink,
        priority: data.priority || 'medium',
        deadline: data.deadline ? new Date(data.deadline) : null,
        projectId: data.projectId || null,
        departmentId: data.departmentId || null,
        taskId: data.taskId || null,
        assigneeId: data.assigneeId || null,
        reviewerId: data.reviewerId || null,
        referenceLinks: data.referenceLinks,
        status: data.assigneeId ? 'in_progress' : 'brief',
        organizationId: user.organizationId,
        createdById: user.id,
      },
    });
    if (data.assigneeId && data.assigneeId !== user.id) {
      await this.notifications.notify(data.assigneeId, `${this.notifPrefix()}_assigned`, 'New creative request', `"${item.title}" was assigned to you`, `/${this.notifPrefix()}`);
    }
    return this.detail(item.id, user.organizationId);
  }

  async update(id: string, data: any, user: any) {
    const item = await this.detail(id, user.organizationId);
    if (!this.isManager(user) && item.createdById !== user.id && item.assigneeId !== user.id) {
      throw new ForbiddenException('Access denied');
    }
    const updated = await this.model().update({
      where: { id },
      data: {
        title: data.title, brief: data.brief, dimensions: data.dimensions, format: data.format,
        requirements: data.requirements, sourceLink: data.sourceLink, priority: data.priority,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        assigneeId: data.assigneeId, reviewerId: data.reviewerId, departmentId: data.departmentId,
        projectId: data.projectId, status: data.status,
      },
    });
    if (data.assigneeId && data.assigneeId !== item.assigneeId) {
      await this.notifications.notify(data.assigneeId, `${this.notifPrefix()}_assigned`, 'Assigned to you', `"${item.title}"`, `/${this.notifPrefix()}`);
    }
    return updated;
  }

  async uploadVersion(id: string, file: { fileUrl?: string; externalUrl?: string; fileName?: string; mimeType?: string; size?: number; notes?: string; duration?: number }, user: any) {
    const item = await this.detail(id, user.organizationId);
    if (!this.isManager(user) && item.assigneeId !== user.id) throw new ForbiddenException('Only the assignee can upload versions');
    const lastVersion = item.versions[0]?.version ?? 0;
    const version = await this.versionModel().create({
      data: {
        requestId: id,
        version: lastVersion + 1,
        fileUrl: file.fileUrl,
        externalUrl: file.externalUrl,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        notes: file.notes,
        duration: file.duration,
        status: 'submitted',
        uploadedById: user.id,
      },
    });
    await this.model().update({ where: { id }, data: { status: 'internal_review' } });
    // Notify reviewers
    const reviewers = [item.reviewerId, item.createdById].filter(Boolean) as string[];
    const managers = await this.notifications.userIdsWithRoles(user.organizationId, MANAGER_ROLES);
    await this.notifications.notifyMany(
      [...new Set([...reviewers, ...managers])].filter((r) => r !== user.id),
      `${this.notifPrefix()}_submitted`,
      'Work submitted for approval',
      `Version ${version.version} of "${item.title}" is ready for review`,
      `/${this.notifPrefix()}`,
    );
    return version;
  }

  async reviewVersion(requestId: string, versionId: string, action: 'approve' | 'reject' | 'changes', feedback: string | undefined, user: any) {
    if (!this.isManager(user)) throw new ForbiddenException('Only managers can review');
    const item = await this.detail(requestId, user.organizationId);
    const version = await this.versionModel().findFirst({ where: { id: versionId, requestId } });
    if (!version) throw new NotFoundException('Version not found');
    if (action === 'changes' && !feedback?.trim()) throw new BadRequestException('Feedback is required when requesting changes');

    const versionStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes_requested';
    await this.versionModel().update({
      where: { id: versionId },
      data: { status: versionStatus, feedback, reviewedById: user.id, reviewedAt: new Date() },
    });

    const requestStatus = action === 'approve' ? 'approved' : 'changes_requested';
    await this.model().update({
      where: { id: requestId },
      data: { status: requestStatus, ...(action === 'approve' ? { finalVersionId: versionId } : {}) },
    });

    const targets = [item.assigneeId, item.createdById].filter((u): u is string => !!u && u !== user.id);
    const verb = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'changes requested on';
    await this.notifications.notifyMany(
      targets,
      `${this.notifPrefix()}_${action === 'changes' ? 'changes' : action + 'd'}`,
      `Submission ${verb}`,
      `"${item.title}" v${version.version} — ${verb}${feedback ? `: ${feedback}` : ''}`,
      `/${this.notifPrefix()}`,
    );
    return { status: requestStatus };
  }

  async markDelivered(id: string, user: any) {
    if (!this.isManager(user)) throw new ForbiddenException('Only managers can mark delivered');
    const item = await this.detail(id, user.organizationId);
    if (item.status !== 'approved') throw new BadRequestException('Only approved work can be delivered');
    return this.model().update({ where: { id }, data: { status: 'delivered' } });
  }

  async remove(id: string, user: any) {
    if (!this.isManager(user)) throw new ForbiddenException('Only managers can delete requests');
    await this.detail(id, user.organizationId);
    await this.model().delete({ where: { id } });
    return { message: 'Deleted' };
  }
}

@Controller('creatives')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CreativesController {
  constructor(private readonly creatives: CreativesService) {}

  @Get()
  list(@Request() req: any, @Query() query: any) {
    return this.creatives.listCreatives(req.user, query);
  }

  @Get('dashboard')
  dashboard(@Request() req: any) {
    return this.creatives.creativeDashboard(req.user);
  }

  @Get('approvers')
  approvers(@Request() req: any) {
    return this.creatives.creativeApprovers(req.user.organizationId);
  }

  @Get('resources')
  resources(@Request() req: any) {
    return this.creatives.creativeResources(req.user.organizationId);
  }

  @Get(':id/versions/:versionId/file')
  creativeFile(@Param('id') id: string, @Param('versionId') versionId: string, @Request() req: any, @Res() response: Response) {
    return this.creatives.sendCreativeFile(id, versionId, req.user, response);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Request() req: any) {
    return this.creatives.creativeDetail(id, req.user);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: uploadStorage,
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: creativeFileFilter,
  }))
  async create(@Body() body: any, @UploadedFile() file: any, @Request() req: any) {
    try {
      return await this.creatives.createCreative(body, req.user, file);
    } catch (error) {
      removeCreativeUpload(file?.filename);
      throw error;
    }
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.creatives.updateCreative(id, body, req.user);
  }

  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file', {
    storage: uploadStorage,
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: creativeFileFilter,
  }))
  async uploadVersion(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() body: { notes?: string; externalUrl?: string },
    @Request() req: any,
  ) {
    try {
      return await this.creatives.uploadCreativeVersion(
        id,
        file
          ? { fileUrl: `/uploads/${file.filename}`, fileName: file.originalname, mimeType: file.mimetype, size: file.size, notes: body.notes }
          : { externalUrl: body.externalUrl, notes: body.notes },
        req.user,
      );
    } catch (error) {
      removeCreativeUpload(file?.filename);
      throw error;
    }
  }

  @Post(':id/versions/:versionId/review')
  reviewVersion(@Param('id') id: string, @Param('versionId') versionId: string, @Body() body: { action: 'approve' | 'reject' | 'changes'; message?: string; feedback?: string }, @Request() req: any) {
    return this.creatives.reviewCreativeStage(id, versionId, body.action, body.message ?? body.feedback, req.user);
  }

  @Post(':id/deliver')
  @Roles(...MANAGER_ROLES)
  deliver(@Param('id') id: string, @Request() req: any) {
    return this.creatives.markCreativeDelivered(id, req.user);
  }

  @Delete(':id')
  @Roles(...MANAGER_ROLES)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.creatives.removeCreative(id, req.user);
  }
}

@Module({
  controllers: [CreativesController],
  providers: [CreativesService],
})
export class CreativesModule {}
