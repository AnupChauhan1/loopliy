import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { getJwtSecret } from '../auth/jwt-secret';

interface SocketUser {
  id: string;
  email: string;
  organizationId: string;
}

const PRIVILEGED = new Set(['Super Admin', 'Admin']);

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => {
          try {
            return new URL(o.includes('://') ? o : `https://${o}`).origin;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as string[];
      try {
        const url = new URL(origin);
        if (process.env.NODE_ENV !== 'production' || allowed.includes(origin) || url.hostname.endsWith('.onrender.com')) {
          return callback(null, true);
        }
      } catch {
        /* fallthrough */
      }
      callback(null, false);
    },
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  private readonly online = new Map<string, Set<string>>(); // userId -> socket ids
  private readonly jwt = new JwtService({ secret: getJwtSecret() });

  @WebSocketServer() server: Server;

  constructor(
    private prisma: PrismaService,
    private chat: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) throw new Error('Missing token');
      const payload = this.jwt.verify(token) as { sub: string; organizationId: string };
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, isActive: true },
        select: { id: true, email: true, organizationId: true },
      });
      if (!user) throw new Error('User not found');
      client.data.user = user as SocketUser;
      client.join(`user:${user.id}`);
      client.join(`org:${user.organizationId}`);

      const sockets = this.online.get(user.id) ?? new Set<string>();
      const wasOffline = sockets.size === 0;
      sockets.add(client.id);
      this.online.set(user.id, sockets);
      if (wasOffline) {
        await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
        this.server.to(`org:${user.organizationId}`).emit('presence:update', { userId: user.id, online: true });
      }
      client.emit('connected', { userId: user.id });
    } catch (error) {
      this.logger.warn(`WS auth failed: ${error instanceof Error ? error.message : error}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return;
    const sockets = this.online.get(user.id);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.online.delete(user.id);
        await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
        this.server.to(`org:${user.organizationId}`).emit('presence:update', { userId: user.id, online: false });
      }
    }
  }

  private user(client: Socket): SocketUser {
    const u = client.data.user as SocketUser | undefined;
    if (!u) throw new Error('Socket not authenticated yet — wait for the "connected" event');
    return u;
  }

  /** Broadcast a persisted message to the conversation room and every
   *  member's user room, and create notifications for other members.
   *  Used by both the WS handler and the REST fallback endpoint. */
  async dispatchMessage(conversationId: string, message: any, memberIds: string[], senderId: string) {
    this.server.to(`conv:${conversationId}`).emit('chat:message', { message });
    for (const uid of memberIds) {
      this.server.to(`user:${uid}`).emit('chat:message:dm', { message });
    }
    const others = memberIds.filter((id) => id !== senderId);
    if (others.length) {
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { firstName: true, lastName: true },
      });
      await this.prisma.notification.createMany({
        data: others.map((uid) => ({
          userId: uid,
          type: 'chat_message',
          title: `New message from ${sender?.firstName ?? ''} ${sender?.lastName ?? ''}`.trim(),
          message: message.content?.slice(0, 140) || 'Sent an attachment',
          data: { link: `/chat?c=${conversationId}` },
        })),
      });
      for (const uid of others) {
        this.server.to(`user:${uid}`).emit('notification:new', { conversationId });
      }
    }
  }

  @SubscribeMessage('chat:join')
  async joinConversation(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const user = this.user(client);
    await this.chat.requireMember(body.conversationId, user.id);
    await client.join(`conv:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:send')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; content?: string; attachments?: unknown; replyToId?: string },
  ) {
    const user = this.user(client);
    const { message, memberIds } = await this.chat.sendMessage(body.conversationId, user.id, body);
    await this.dispatchMessage(body.conversationId, message, memberIds, user.id);
    return { ok: true, message };
  }

  @SubscribeMessage('chat:typing')
  typing(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string; isTyping?: boolean }) {
    const user = this.user(client);
    client.to(`conv:${body.conversationId}`).emit('chat:typing', {
      conversationId: body.conversationId,
      userId: user.id,
      isTyping: !!body.isTyping,
    });
    return { ok: true };
  }

  @SubscribeMessage('chat:read')
  async markRead(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const user = this.user(client);
    const result = await this.chat.markRead(body.conversationId, user.id);
    this.server.to(`conv:${body.conversationId}`).emit('chat:read', {
      conversationId: body.conversationId,
      userId: user.id,
      readAt: new Date().toISOString(),
    });
    return { ok: true, ...result };
  }

  @SubscribeMessage('call:start')
  async callStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; type: 'audio' | 'video'; participantIds?: string[] },
  ) {
    const user = this.user(client);
    const memberIds = await this.chat.memberIds(body.conversationId);
    const targets = (body.participantIds?.length ? body.participantIds : memberIds.filter((id) => id !== user.id))
      .filter((id) => memberIds.includes(id) && id !== user.id);
    const { call } = await this.chat.createCall({
      conversationId: body.conversationId,
      type: body.type,
      initiatedById: user.id,
      participantIds: targets,
    });
    const caller = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    const payload = {
      callId: call.id,
      conversationId: body.conversationId,
      type: body.type,
      from: caller,
    };
    for (const targetId of targets) {
      this.server.to(`user:${targetId}`).emit('call:incoming', payload);
    }
    return { ok: true, callId: call.id };
  }

  @SubscribeMessage('call:signal')
  async callSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId: string; toUserId: string; signal: unknown },
  ) {
    const user = this.user(client);
    await this.chat.getCallForUser(body.callId, user.id);
    this.server.to(`user:${body.toUserId}`).emit('call:signal', {
      callId: body.callId,
      fromUserId: user.id,
      signal: body.signal,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:accept')
  async callAccept(@ConnectedSocket() client: Socket, @MessageBody() body: { callId: string }) {
    const user = this.user(client);
    await this.chat.markCallJoined(body.callId, user.id);
    const call = await this.chat.updateCallStatus(body.callId, user.id, 'active');
    if (call.conversationId) {
      this.server.to(`conv:${call.conversationId}`).emit('call:status', { callId: call.id, status: 'active', userId: user.id });
    }
    return { ok: true };
  }

  @SubscribeMessage('call:reject')
  async callReject(@ConnectedSocket() client: Socket, @MessageBody() body: { callId: string }) {
    const user = this.user(client);
    const call = await this.chat.updateCallStatus(body.callId, user.id, 'declined');
    await this.notifyCallEnded(call.id, 'declined');
    return { ok: true };
  }

  @SubscribeMessage('call:end')
  async callEnd(@ConnectedSocket() client: Socket, @MessageBody() body: { callId: string }) {
    const user = this.user(client);
    const call = await this.chat.updateCallStatus(body.callId, user.id, 'ended');
    await this.notifyCallEnded(call.id, 'ended');
    return { ok: true };
  }

  private async notifyCallEnded(callId: string, status: string) {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: { participants: { select: { userId: true } } },
    });
    if (!call) return;
    const payload = { callId, status, conversationId: call.conversationId, type: call.type };
    for (const p of call.participants) {
      this.server.to(`user:${p.userId}`).emit('call:status', payload);
    }
    if (call.conversationId) {
      this.server.to(`conv:${call.conversationId}`).emit('call:status', payload);
    }
  }

  @SubscribeMessage('presence:get')
  async presenceGet(@ConnectedSocket() client: Socket, @MessageBody() body: { userIds?: string[] }) {
    const user = this.user(client);
    const ids = (body.userIds ?? []).slice(0, 200);
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids }, organizationId: user.organizationId },
      select: { id: true, lastSeenAt: true },
    });
    const onlineSet = new Set<string>();
    for (const [uid, sockets] of this.online) if (sockets.size > 0) onlineSet.add(uid);
    return {
      ok: true,
      presence: rows.map((r) => ({ userId: r.id, online: onlineSet.has(r.id), lastSeenAt: r.lastSeenAt })),
    };
  }
}
