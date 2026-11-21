import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const USER_BRIEF = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  avatar: true,
  isActive: true,
  lastSeenAt: true,
  department: { select: { id: true, name: true, color: true } },
  roles: { include: { role: { select: { id: true, name: true } } } },
} as const;

const MESSAGE_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  reads: { select: { userId: true } },
} as const;

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // ---------- membership ----------

  async isMember(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    return !!member;
  }

  async requireMember(conversationId: string, userId: string) {
    if (!(await this.isMember(conversationId, userId))) {
      throw new ForbiddenException('You are not a member of this conversation');
    }
  }

  async memberIds(conversationId: string) {
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  // ---------- conversations ----------

  async conversationsForUser(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: USER_BRIEF } } },
            client: { select: { id: true, name: true, email: true } },
            project: { select: { id: true, name: true, status: true } },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: MESSAGE_INCLUDE,
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const convIds = memberships.map((m) => m.conversationId);
    const unreadGroups = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: convIds },
        deletedAt: null,
        userId: { not: userId },
        reads: { none: { userId } },
      },
      _count: { _all: true },
    });
    const unreadMap = new Map(unreadGroups.map((g) => [g.conversationId, g._count._all]));

    return memberships
      .map((m) => {
        const c = m.conversation;
        const others = c.members.filter((mm) => mm.userId !== userId).map((mm) => mm.user);
        const last = c.messages[0] ?? null;
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          client: c.client,
          project: c.project,
          members: c.members.map((mm) => ({
            userId: mm.userId,
            role: mm.role,
            user: mm.user,
          })),
          peer: c.type === 'direct' && others.length === 1 ? others[0] : null,
          memberCount: c.members.length,
          lastMessage: last
            ? {
                id: last.id,
                content: last.deletedAt ? '' : last.content,
                createdAt: last.createdAt,
                sender: last.user,
              }
            : null,
          unreadCount: unreadMap.get(c.id) ?? 0,
          updatedAt: c.updatedAt,
        };
      })
      .sort((a, b) => {
        const at = a.lastMessage?.createdAt ?? a.updatedAt;
        const bt = b.lastMessage?.createdAt ?? b.updatedAt;
        return new Date(bt).getTime() - new Date(at).getTime();
      });
  }

  private async hasClientRole(userId: string) {
    const link = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: 'Client' } },
      select: { id: true },
    });
    return !!link;
  }

  async getOrCreateDirect(userId: string, otherUserId: string) {
    if (userId === otherUserId) throw new BadRequestException('Cannot start a chat with yourself');
    if ((await this.hasClientRole(userId)) || (await this.hasClientRole(otherUserId))) {
      throw new BadRequestException('Client accounts communicate through their client portal conversation.');
    }
    const other = await this.prisma.user.findFirst({
      where: { id: otherUserId, isActive: true },
      select: { id: true, organizationId: true },
    });
    if (!other) throw new NotFoundException('User not found');

    const mine = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const candidates = await this.prisma.conversation.findMany({
      where: {
        id: { in: mine.map((m) => m.conversationId) },
        type: 'direct',
        members: { some: { userId: otherUserId } },
      },
      include: { members: { select: { userId: true } } },
    });
    const existing = candidates.find((c) => c.members.length === 2);
    if (existing) return { id: existing.id, created: false };

    const created = await this.prisma.conversation.create({
      data: {
        type: 'direct',
        members: {
          create: [{ userId }, { userId: otherUserId }],
        },
      },
    });
    return { id: created.id, created: true };
  }

  async createGroup(data: { name?: string; memberIds: string[]; projectId?: string; userId: string }) {
    const memberIds = [...new Set([data.userId, ...data.memberIds])];
    if (memberIds.length < 2) throw new BadRequestException('Group needs at least one other member');
    const users = await this.prisma.user.findMany({
      where: { id: { in: memberIds }, isActive: true },
      select: { id: true },
    });
    if (users.length !== memberIds.length) throw new BadRequestException('One or more members are invalid');
    for (const id of memberIds) {
      if (await this.hasClientRole(id)) {
        throw new BadRequestException('Client accounts cannot be added to internal group chats.');
      }
    }
    if (data.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: data.projectId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }
    const conversation = await this.prisma.conversation.create({
      data: {
        type: 'group',
        name: data.name?.trim() || null,
        projectId: data.projectId || null,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
    });
    return { id: conversation.id };
  }

  // ---------- messages ----------

  async messages(conversationId: string, userId: string, opts: { before?: string; take?: number }) {
    await this.requireMember(conversationId, userId);
    const take = Math.min(Math.max(opts.take ?? 50, 1), 100);
    const where: any = { conversationId, deletedAt: null };
    if (opts.before) {
      const cursor = await this.prisma.message.findFirst({
        where: { id: opts.before, conversationId },
        select: { createdAt: true },
      });
      if (cursor) where.createdAt = { lt: cursor.createdAt };
    }
    const rows = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      include: MESSAGE_INCLUDE,
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse();
    return { messages: page, hasMore };
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    data: { content?: string; attachments?: unknown; replyToId?: string },
  ) {
    await this.requireMember(conversationId, userId);
    const content = (data.content ?? '').trim();
    const attachments = Array.isArray(data.attachments) ? data.attachments : undefined;
    if (!content && (!attachments || attachments.length === 0)) {
      throw new BadRequestException('Message cannot be empty');
    }
    if (data.replyToId) {
      const reply = await this.prisma.message.findFirst({
        where: { id: data.replyToId, conversationId },
        select: { id: true },
      });
      if (!reply) throw new BadRequestException('Reply target not found in this conversation');
    }
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        userId,
        content,
        attachments: attachments as any,
        replyToId: data.replyToId || null,
      },
      include: MESSAGE_INCLUDE,
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return { message, memberIds: await this.memberIds(conversationId) };
  }

  async markRead(conversationId: string, userId: string) {
    await this.requireMember(conversationId, userId);
    const unread = await this.prisma.message.findMany({
      where: {
        conversationId,
        userId: { not: userId },
        deletedAt: null,
        reads: { none: { userId } },
      },
      select: { id: true },
    });
    if (unread.length) {
      await this.prisma.messageRead.createMany({
        data: unread.map((m) => ({ messageId: m.id, userId })),
        skipDuplicates: true,
      });
    }
    return { marked: unread.length };
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.userId !== userId) throw new ForbiddenException('Only the author can edit a message');
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    return this.prisma.message.update({
      where: { id: messageId },
      data: { content: trimmed, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
  }

  async deleteMessage(messageId: string, userId: string, isPrivileged: boolean) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.userId !== userId && !isPrivileged) {
      throw new ForbiddenException('Only the author or an admin can delete a message');
    }
    return this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
  }

  async togglePin(messageId: string, userId: string, isPrivileged: boolean) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new NotFoundException('Message not found');
    await this.requireMember(message.conversationId, userId);
    if (message.userId !== userId && !isPrivileged) {
      throw new ForbiddenException('Only the author or an admin can pin a message');
    }
    return this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: message.pinnedAt ? null : new Date() },
      include: MESSAGE_INCLUDE,
    });
  }

  async searchMessages(conversationId: string, userId: string, q: string) {
    await this.requireMember(conversationId, userId);
    if (!q.trim()) return [];
    return this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        content: { contains: q.trim(), mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: MESSAGE_INCLUDE,
    });
  }

  // ---------- users for chat ----------

  async chatUsers(organizationId: string, q?: string, excludeId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: USER_BRIEF,
      orderBy: { firstName: 'asc' },
      take: 100,
    });
    return users.map((u) => ({
      ...u,
      roleNames: u.roles.map((r) => r.role.name),
      roles: u.roles.map((r) => r.role),
    }));
  }

  // ---------- calls ----------

  async callHistory(userId: string) {
    return this.prisma.call.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        initiatedBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        conversation: { select: { id: true, name: true, type: true } },
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        },
      },
    });
  }

  async createCall(data: {
    conversationId: string;
    type: 'audio' | 'video';
    initiatedById: string;
    participantIds: string[];
  }) {
    await this.requireMember(data.conversationId, data.initiatedById);
    const memberIds = await this.memberIds(data.conversationId);
    const targets = data.participantIds.filter((id) => memberIds.includes(id) && id !== data.initiatedById);
    if (targets.length === 0) throw new BadRequestException('No valid call participants');

    const call = await this.prisma.call.create({
      data: {
        type: data.type,
        status: 'ringing',
        conversationId: data.conversationId,
        initiatedById: data.initiatedById,
        startedAt: new Date(),
        participants: {
          create: [data.initiatedById, ...targets].map((userId) => ({ userId, joinedAt: userId === data.initiatedById ? new Date() : null })),
        },
      },
      include: {
        initiatedBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
      },
    });
    return { call, targets };
  }

  async getCallForUser(callId: string, userId: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { participants: true },
    });
    if (!call) throw new NotFoundException('Call not found');
    if (!call.participants.some((p) => p.userId === userId)) {
      throw new ForbiddenException('You are not part of this call');
    }
    return call;
  }

  async updateCallStatus(callId: string, userId: string, status: 'active' | 'ended' | 'missed' | 'declined') {
    const call = await this.getCallForUser(callId, userId);
    const now = new Date();
    const data: any = { status };
    if (status === 'active') data.startedAt = call.startedAt ?? now;
    if (status === 'ended' || status === 'missed' || status === 'declined') {
      data.endedAt = now;
      const start = call.startedAt ?? call.createdAt;
      data.duration = Math.max(0, Math.round((now.getTime() - start.getTime()) / 1000));
      await this.prisma.callParticipant.updateMany({
        where: { callId, leftAt: null },
        data: { leftAt: now },
      });
    }
    if (status === 'declined' || status === 'missed') {
      await this.prisma.callParticipant.updateMany({
        where: { callId, userId },
        data: { leftAt: now },
      });
    }
    return this.prisma.call.update({ where: { id: callId }, data });
  }

  async markCallJoined(callId: string, userId: string) {
    await this.getCallForUser(callId, userId);
    await this.prisma.callParticipant.updateMany({
      where: { callId, userId },
      data: { joinedAt: new Date(), leftAt: null },
    });
  }

  unreadTotal(userId: string) {
    return this.prisma.message.count({
      where: {
        deletedAt: null,
        userId: { not: userId },
        conversation: { members: { some: { userId } } },
        reads: { none: { userId } },
      },
    });
  }
}
