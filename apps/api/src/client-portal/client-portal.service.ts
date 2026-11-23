import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { basename, join } from 'path';
import { existsSync } from 'fs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MANAGER_ROLES } from '../common/roles';

type PortalUser = {
  id: string;
  organizationId: string;
  clientProfile?: { id: string } | null;
};

type ClientAccountInput = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
};

@Injectable()
export class ClientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async clientForUser(user: PortalUser) {
    const clientId = user.clientProfile?.id;
    if (!clientId) throw new ForbiddenException('This account is not linked to a client.');

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId, portalUserId: user.id },
      select: { id: true, name: true, email: true, organizationId: true, portalUserId: true },
    });
    if (!client) throw new ForbiddenException('This account is not linked to a client.');
    return client;
  }

  async dashboard(user: PortalUser) {
    const client = await this.clientForUser(user);
    const projects = await this.prisma.project.findMany({
      where: { organizationId: user.organizationId, clientId: client.id },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        progress: true,
        startDate: true,
        deadline: true,
        milestones: {
          select: { id: true, name: true, description: true, dueDate: true, status: true },
          orderBy: { dueDate: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const projectIds = projects.map((project) => project.id);
    const creativeProjectScope = projectIds.length
      ? [
          { clientId: client.id, projectId: { in: projectIds } },
          { clientId: client.id, projectId: null },
          { clientId: null, projectId: { in: projectIds } },
        ]
      : [{ clientId: client.id, projectId: null }];

    const [tasks, creatives, videos, files] = await Promise.all([
      this.prisma.task.findMany({
        where: { projectId: { in: projectIds }, clientVisible: true },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          progress: true,
          deadline: true,
          updatedAt: true,
          project: { select: { id: true, name: true } },
          statusHistory: {
            select: { id: true, fromStatus: true, toStatus: true, changedAt: true },
            orderBy: { changedAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.creativeRequest.findMany({
        where: {
          organizationId: user.organizationId,
          status: 'delivered',
          OR: creativeProjectScope,
        },
        select: {
          id: true,
          title: true,
          brief: true,
          deadline: true,
          projectId: true,
          project: { select: { name: true } },
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              id: true,
              version: true,
              fileUrl: true,
              fileName: true,
              mimeType: true,
              externalUrl: true,
              notes: true,
              status: true,
              feedback: true,
              createdAt: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.videoRequest.findMany({
        where: {
          organizationId: user.organizationId,
          projectId: { in: projectIds },
          status: 'delivered',
        },
        select: {
          id: true,
          title: true,
          brief: true,
          deadline: true,
          projectId: true,
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              id: true,
              version: true,
              fileUrl: true,
              fileName: true,
              mimeType: true,
              externalUrl: true,
              notes: true,
              status: true,
              feedback: true,
              createdAt: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.projectFile.findMany({
        where: { projectId: { in: projectIds }, project: { organizationId: user.organizationId, clientId: client.id } },
        select: { id: true, name: true, mimeType: true, size: true, createdAt: true, project: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const toDeliverable = (kind: 'creative' | 'video', request: any) => {
      const version = request.versions[0];
      if (!version) return null;
      return {
        id: request.id,
        kind,
        title: request.title,
        description: request.brief,
        deadline: request.deadline,
        projectName: request.project?.name ?? projects.find((project) => project.id === request.projectId)?.name ?? null,
        latestVersion: {
          ...version,
          fileUrl: undefined,
          downloadUrl: `/client-portal/deliverables/${kind}/${request.id}/versions/${version.id}/file`,
        },
      };
    };

    const deliverables = [
      ...creatives.map((request) => toDeliverable('creative', request)),
      ...videos.map((request) => toDeliverable('video', request)),
    ]
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b.latestVersion.createdAt).getTime() - new Date(a.latestVersion.createdAt).getTime());

    return {
      client: { id: client.id, name: client.name },
      projects,
      tasks,
      deliverables,
      files: files.map((file) => ({
        ...file,
        downloadUrl: `/client-portal/files/${file.id}`,
      })),
    };
  }

  async projectFile(fileId: string, user: PortalUser) {
    const client = await this.clientForUser(user);
    const file = await this.prisma.projectFile.findFirst({
      where: {
        id: fileId,
        project: { organizationId: user.organizationId, clientId: client.id },
      },
      select: { url: true, name: true, mimeType: true },
    });
    if (!file) throw new NotFoundException('Project file not found.');
    return this.resolveFile(file.url, file.name, file.mimeType);
  }

  async deliverableFile(kind: string, requestId: string, versionId: string, user: PortalUser) {
    const client = await this.clientForUser(user);
    const projects = await this.prisma.project.findMany({
      where: { organizationId: user.organizationId, clientId: client.id },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    const projectScope = projectIds.length
      ? [
          { clientId: client.id, projectId: { in: projectIds } },
          { clientId: client.id, projectId: null },
          { clientId: null, projectId: { in: projectIds } },
        ]
      : [{ clientId: client.id, projectId: null }];

    if (kind === 'creative') {
      const request = await this.prisma.creativeRequest.findFirst({
        where: { id: requestId, organizationId: user.organizationId, status: 'delivered', OR: projectScope },
        select: { versions: { where: { id: versionId }, select: { fileUrl: true, externalUrl: true, fileName: true, mimeType: true } } },
      });
      const version = request?.versions[0];
      if (!version) throw new NotFoundException('Deliverable file not found.');
      return this.resolveFile(version.fileUrl, version.fileName, version.mimeType, version.externalUrl);
    }

    if (kind === 'video') {
      const request = await this.prisma.videoRequest.findFirst({
        where: { id: requestId, organizationId: user.organizationId, projectId: { in: projectIds }, status: 'delivered' },
        select: { versions: { where: { id: versionId }, select: { fileUrl: true, externalUrl: true, fileName: true, mimeType: true } } },
      });
      const version = request?.versions[0];
      if (!version) throw new NotFoundException('Deliverable file not found.');
      return this.resolveFile(version.fileUrl, version.fileName, version.mimeType, version.externalUrl);
    }

    throw new NotFoundException('Deliverable file not found.');
  }

  private resolveFile(url: string | null, fileName: string | null, mimeType: string | null, externalUrl?: string | null) {
    if (externalUrl) return { redirectUrl: externalUrl };
    if (!url) throw new NotFoundException('File not found.');
    if (/^https?:\/\//i.test(url)) return { redirectUrl: url };

    let directory: string;
    let storedName: string;
    if (url.startsWith('private:')) {
      storedName = url.slice('private:'.length);
      directory = join(process.cwd(), 'creative-uploads');
    } else if (url.startsWith('/uploads/')) {
      storedName = url.slice('/uploads/'.length);
      directory = join(process.cwd(), 'uploads');
    } else {
      throw new NotFoundException('File not found.');
    }

    if (!storedName || basename(storedName) !== storedName) throw new NotFoundException('File not found.');
    const filePath = join(directory, storedName);
    if (!existsSync(filePath)) throw new NotFoundException('File not found.');
    return { filePath, fileName: basename(fileName || storedName).replace(/[\r\n"]/g, '_'), mimeType: mimeType || 'application/octet-stream' };
  }

  async reviewDeliverable(
    kind: string,
    requestId: string,
    versionId: string,
    action: 'approve' | 'reject' | 'changes',
    feedback: string | undefined,
    user: PortalUser & { firstName?: string; lastName?: string },
  ) {
    if (action !== 'approve' && !feedback?.trim()) {
      throw new BadRequestException('Feedback is required when rejecting a deliverable or requesting changes.');
    }

    const client = await this.clientForUser(user);
    const projectIds = (
      await this.prisma.project.findMany({
        where: { organizationId: user.organizationId, clientId: client.id },
        select: { id: true },
      })
    ).map((project) => project.id);
    const statuses = { approve: 'client_approved', reject: 'rejected', changes: 'changes_requested' } as const;
    const status = statuses[action];
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    let requestTitle: string;
    let requestOwnerIds: string[];

    if (kind === 'creative') {
      const scope = projectIds.length
        ? [
            { clientId: client.id, projectId: { in: projectIds } },
            { clientId: client.id, projectId: null },
            { clientId: null, projectId: { in: projectIds } },
          ]
        : [{ clientId: client.id, projectId: null }];
      const request = await this.prisma.creativeRequest.findFirst({
        where: { id: requestId, organizationId: user.organizationId, status: 'delivered', OR: scope },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const version = request?.versions[0];
      if (!request || !version || version.id !== versionId) {
        throw new NotFoundException('Deliverable is not available for client review.');
      }
      if (version.status !== 'submitted') throw new ConflictException('This version has already been reviewed.');
      await this.prisma.$transaction([
        this.prisma.creativeVersion.update({
          where: { id: version.id },
          data: { status, feedback: feedback?.trim() || null, reviewedById: user.id, reviewedAt: new Date() },
        }),
        this.prisma.creativeApprovalEvent.create({
          data: {
            requestId: request.id,
            versionId: version.id,
            actorId: user.id,
            actorName: fullName,
            stage: 'client',
            action,
            message: feedback?.trim() || null,
          },
        }),
      ]);
      requestTitle = request.title;
      requestOwnerIds = [request.createdById, request.assigneeId].filter((id): id is string => !!id);
    } else if (kind === 'video') {
      const request = await this.prisma.videoRequest.findFirst({
        where: { id: requestId, organizationId: user.organizationId, projectId: { in: projectIds }, status: 'delivered' },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const version = request?.versions[0];
      if (!request || !version || version.id !== versionId) {
        throw new NotFoundException('Deliverable is not available for client review.');
      }
      if (version.status !== 'submitted') throw new ConflictException('This version has already been reviewed.');
      await this.prisma.videoVersion.update({
        where: { id: version.id },
        data: { status, feedback: feedback?.trim() || null, reviewedById: user.id, reviewedAt: new Date() },
      });
      requestTitle = request.title;
      requestOwnerIds = [request.createdById, request.assigneeId].filter((id): id is string => !!id);
    } else {
      throw new NotFoundException('Deliverable is not available for client review.');
    }

    const managerIds = await this.notifications.userIdsWithRoles(user.organizationId, MANAGER_ROLES);
    await this.notifications.notifyMany(
      [...requestOwnerIds, ...managerIds],
      'client_review',
      `Client ${action === 'approve' ? 'approved' : action === 'changes' ? 'requested changes to' : 'rejected'} a deliverable`,
      `"${requestTitle}"${feedback?.trim() ? `: ${feedback.trim()}` : ''}`,
      '/client-messages',
    );
    return { status };
  }

  async clientMessages(user: PortalUser) {
    const client = await this.clientForUser(user);
    const conversation = await this.ensureConversation(client, user.id);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return messages.reverse();
  }

  async sendClientMessage(content: string, user: PortalUser) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty.');
    const client = await this.clientForUser(user);
    const conversation = await this.ensureConversation(client, user.id);
    const message = await this.prisma.message.create({
      data: { conversationId: conversation.id, userId: user.id, content: trimmed },
      select: { id: true, content: true, createdAt: true, userId: true },
    });
    const owners = await this.prisma.project.findMany({
      where: { organizationId: user.organizationId, clientId: client.id },
      select: { ownerId: true },
    });
    const managers = await this.notifications.userIdsWithRoles(user.organizationId, MANAGER_ROLES);
    await this.notifications.notifyMany(
      [...owners.map((project) => project.ownerId), ...managers],
      'client_message',
      `New message from ${client.name}`,
      trimmed,
      '/client-messages',
    );
    return message;
  }

  async listClients(organizationId: string) {
    return this.prisma.client.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        portalUser: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
        _count: { select: { projects: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createClient(data: ClientAccountInput & { name: string; phone?: string }, actor: PortalUser) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('An account with this email already exists.');
    const passwordHash = await bcrypt.hash(data.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          organizationId: actor.organizationId,
        },
      });
      const account = await this.createPortalAccount(tx, client, data, passwordHash);
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.id,
          action: 'create',
          resource: 'client_portal_account',
          resourceId: account.id,
          changes: { clientId: client.id, email: account.email },
        },
      });
      return { client, account };
    });
    await this.ensureConversation(result.client, result.account.id);
    return { client: result.client, account: this.safeAccount(result.account) };
  }

  async createClientAccount(clientId: string, data: ClientAccountInput, actor: PortalUser) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: actor.organizationId },
    });
    if (!client) throw new NotFoundException('Client not found.');
    if (client.portalUserId) throw new ConflictException('This client already has a portal account.');

    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('An account with this email already exists.');
    const passwordHash = await bcrypt.hash(data.password, 12);
    const account = await this.prisma.$transaction(async (tx) => {
      const created = await this.createPortalAccount(tx, client, data, passwordHash);
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.id,
          action: 'create',
          resource: 'client_portal_account',
          resourceId: created.id,
          changes: { clientId: client.id, email: created.email },
        },
      });
      return created;
    });
    await this.ensureConversation(client, account.id);
    return { client: { id: client.id, name: client.name }, account: this.safeAccount(account) };
  }

  private async createPortalAccount(tx: any, client: any, data: ClientAccountInput, passwordHash: string) {
    const role = await tx.role.upsert({
      where: { name: 'Client' },
      update: {},
      create: { name: 'Client', description: 'Client portal access' },
    });
    const account = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        organizationId: client.organizationId,
        emailVerified: new Date(),
        approvedAt: new Date(),
      },
    });
    await tx.userRole.create({ data: { userId: account.id, roleId: role.id } });
    await tx.client.update({ where: { id: client.id }, data: { portalUserId: account.id } });
    return account;
  }

  private safeAccount(account: { id: string; email: string; firstName: string; lastName: string }) {
    return { id: account.id, email: account.email, firstName: account.firstName, lastName: account.lastName };
  }

  async conversations(user: PortalUser) {
    return this.prisma.conversation.findMany({
      where: {
        type: 'client_portal',
        client: { organizationId: user.organizationId },
      },
      select: {
        id: true,
        updatedAt: true,
        client: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async staffMessages(conversationId: string, user: PortalUser) {
    await this.staffConversation(conversationId, user);
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      select: {
        id: true,
        content: true,
        createdAt: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return messages.reverse();
  }

  async sendStaffMessage(conversationId: string, content: string, user: PortalUser) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty.');
    const conversation = await this.staffConversation(conversationId, user);
    const message = await this.prisma.message.create({
      data: { conversationId, userId: user.id, content: trimmed },
      select: { id: true, content: true, createdAt: true, userId: true },
    });
    if (conversation.client?.portalUserId) {
      await this.notifications.notify(
        conversation.client.portalUserId,
        'client_message',
        'New message from your team',
        trimmed,
        '/client',
      );
    }
    return message;
  }

  async profile(user: PortalUser) {
    const client = await this.prisma.client.findFirst({
      where: { id: user.clientProfile?.id, organizationId: user.organizationId },
    });
    if (!client) throw new ForbiddenException('This account is not linked to a client.');
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, firstName: true, lastName: true, avatar: true, createdAt: true },
    });
    const projects = await this.prisma.project.findMany({
      where: { organizationId: user.organizationId, clientId: client.id },
      select: { id: true, name: true, status: true, progress: true, deadline: true },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      client: {
        id: client.id,
        name: client.name,
        companyName: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
      },
      account,
      projects,
    };
  }

  async changePassword(user: PortalUser, currentPassword: string, newPassword: string) {
    const account = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!account) throw new NotFoundException('Account not found.');
    const valid = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect.');
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters.');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    return { success: true };
  }

  private async staffConversation(conversationId: string, user: PortalUser) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, type: 'client_portal', client: { organizationId: user.organizationId } },
      select: { id: true, client: { select: { portalUserId: true } } },
    });
    if (!conversation) throw new NotFoundException('Client conversation not found.');
    return conversation;
  }

  private async ensureConversation(client: any, clientUserId: string) {
    const [owners, managers] = await Promise.all([
      this.prisma.project.findMany({
        where: { organizationId: client.organizationId, clientId: client.id },
        select: { ownerId: true },
      }),
      this.notifications.userIdsWithRoles(client.organizationId, MANAGER_ROLES),
    ]);
    const conversation = await this.prisma.conversation.findFirst({
      where: { clientId: client.id, type: 'client_portal' },
    }) ?? await this.prisma.conversation.create({
      data: { clientId: client.id, type: 'client_portal', name: `${client.name} Client Portal` },
    });
    await this.prisma.conversationMember.createMany({
      data: [...new Set([clientUserId, ...owners.map((project) => project.ownerId), ...managers])].map((userId) => ({
        conversationId: conversation.id,
        userId,
      })),
      skipDuplicates: true,
    });
    return conversation;
  }
}
