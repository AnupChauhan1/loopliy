import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, HR_ROLES, MANAGER_ROLES } from '../common/roles';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  list(organizationId: string, user: any) {
    return this.prisma.announcement.findMany({
      where: {
        organizationId,
        OR: [{ departmentId: null }, { departmentId: user.departmentId ?? 'none' }],
      },
      include: {
        department: { select: { id: true, name: true, color: true } },
        author: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async create(data: any, user: any) {
    const ann = await this.prisma.announcement.create({
      data: {
        title: data.title,
        content: data.content,
        departmentId: data.departmentId || null,
        authorId: user.id,
        organizationId: user.organizationId,
      },
    });
    // Notify target audience
    const targets = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        ...(data.departmentId ? { departmentId: data.departmentId } : {}),
      },
      select: { id: true },
    });
    await this.notifications.notifyMany(
      targets.map((t) => t.id).filter((id) => id !== user.id),
      'announcement',
      `📢 ${ann.title}`,
      ann.content.slice(0, 140),
      '/announcements',
    );
    return ann;
  }

  async remove(id: string, user: any) {
    const ann = await this.prisma.announcement.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!ann) throw new NotFoundException('Announcement not found');
    await this.prisma.announcement.delete({ where: { id } });
    return { message: 'Deleted' };
  }
}

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@Request() req: any) {
    return this.announcements.list(req.user.organizationId, req.user);
  }

  @Post()
  @Roles(...HR_ROLES, ...MANAGER_ROLES)
  create(@Body() body: any, @Request() req: any) {
    return this.announcements.create(body, req.user);
  }

  @Delete(':id')
  @Roles(...HR_ROLES, ...MANAGER_ROLES)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.announcements.remove(id, req.user);
  }
}

@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
