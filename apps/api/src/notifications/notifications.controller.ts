import { Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Request() req: any, @Query('unread') unread?: string) {
    return this.notifications.list(req.user.id, unread === 'true');
  }

  @Get('unread-count')
  async unreadCount(@Request() req: any) {
    return { count: await this.notifications.unreadCount(req.user.id) };
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.notifications.markRead(id, req.user.id);
  }

  @Post('read-all')
  markAllRead(@Request() req: any) {
    return this.notifications.markAllRead(req.user.id);
  }
}
