import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Create a notification for a single user. */
  async notify(userId: string, type: string, title: string, message: string, link?: string) {
    if (!userId) return null;
    return this.prisma.notification.create({
      data: { userId, type, title, message, data: link ? { link } : undefined },
    });
  }

  /** Notify many users at once. `extra` is merged into the JSON data payload. */
  async notifyMany(userIds: string[], type: string, title: string, message: string, link?: string, extra?: Record<string, any>) {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return;
    const payload = { ...(link ? { link } : {}), ...(extra ?? {}) };
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type,
        title,
        message,
        data: Object.keys(payload).length ? payload : undefined,
      })),
    });
  }

  /** Batch "task assigned" notifications with deep-link payloads. */
  async notifyTaskAssignments(
    rows: { userId: string; taskId: string; projectId?: string; title: string; projectName?: string; dueDate?: Date | string | null }[],
  ) {
    const data = rows
      .filter((r) => r.userId)
      .map((r) => ({
        userId: r.userId,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `${r.title}${r.projectName ? ` (${r.projectName})` : ''}${r.dueDate ? ` • Due ${new Date(r.dueDate).toLocaleDateString()}` : ''}`,
        data: { link: `/tasks/${r.taskId}`, taskId: r.taskId, ...(r.projectId ? { projectId: r.projectId } : {}) },
      }));
    if (data.length) {
      await this.prisma.notification.createMany({ data });
    }
  }

  /** All user ids in an org that hold any of the given role names. */
  async userIdsWithRoles(organizationId: string, roleNames: string[]) {
    const rows = await this.prisma.userRole.findMany({
      where: {
        role: { name: { in: roleNames } },
        user: { organizationId, isActive: true },
      },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true, readAt: new Date() },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }
}
