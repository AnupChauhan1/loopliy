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

  /** Notify many users at once. */
  async notifyMany(userIds: string[], type: string, title: string, message: string, link?: string) {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return;
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type,
        title,
        message,
        data: link ? { link } : undefined,
      })),
    });
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
