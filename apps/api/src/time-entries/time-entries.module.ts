import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { hasAnyRole, MANAGER_ROLES } from '../common/roles';

const ACTIVE = ['running', 'paused'];
const taskSelect = { select: { id: true, title: true, taskNumber: true, status: true } } as const;

/**
 * Work-time tracking. One TimeEntry is one tracking session:
 *  - `duration` accumulates seconds of finished running segments,
 *  - `segmentStart` marks when the current running segment began,
 *  - elapsed = duration + (running ? now - segmentStart : 0).
 * A user can have at most one running/paused session at a time.
 */
@Injectable()
export class TimeEntriesService {
  constructor(private prisma: PrismaService) {}

  private elapsed(e: { duration: number | null; status: string; segmentStart: Date | null }, now = new Date()) {
    const live = e.status === 'running' && e.segmentStart ? Math.floor((now.getTime() - e.segmentStart.getTime()) / 1000) : 0;
    return (e.duration ?? 0) + Math.max(0, live);
  }

  private present(e: any) {
    const now = new Date();
    return { ...e, elapsedSeconds: this.elapsed(e, now), serverNow: now.toISOString() };
  }

  private async ownActive(id: string, userId: string) {
    const e = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!e || e.userId !== userId) throw new NotFoundException('Time entry not found');
    if (!ACTIVE.includes(e.status)) throw new BadRequestException('This session has already ended');
    return e;
  }

  private async assertTaskAccess(taskId: string, user: any) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, include: { project: true, assignees: true } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.project && task.project.organizationId !== user.organizationId) throw new ForbiddenException('Access denied');
    const assignee = task.assignees.some((a) => a.userId === user.id);
    if (!assignee && !hasAnyRole(user, MANAGER_ROLES)) throw new ForbiddenException('You can only track time on your own tasks');
  }

  /** Recompute Task.actualHours from all finished sessions on that task. */
  private async syncTaskHours(taskId: string | null) {
    if (!taskId) return;
    const agg = await this.prisma.timeEntry.aggregate({ where: { taskId, status: 'stopped' }, _sum: { duration: true } });
    await this.prisma.task.update({ where: { id: taskId }, data: { actualHours: Math.round((agg._sum.duration ?? 0) / 3600) } });
  }

  async current(userId: string) {
    const e = await this.prisma.timeEntry.findFirst({ where: { userId, status: { in: ACTIVE } }, include: { task: taskSelect } });
    return { entry: e ? this.present(e) : null, serverNow: new Date().toISOString() };
  }

  async start(user: any, body: { taskId?: string; notes?: string }) {
    if (body.taskId) await this.assertTaskAccess(body.taskId, user);
    const entry = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.timeEntry.findFirst({ where: { userId: user.id, status: { in: ACTIVE } } });
      if (existing) throw new ConflictException('A timer is already active. Stop or reset it before starting a new one.');
      const now = new Date();
      return tx.timeEntry.create({
        data: { userId: user.id, taskId: body.taskId || null, notes: body.notes || null, startTime: now, segmentStart: now, duration: 0, status: 'running' },
        include: { task: taskSelect },
      });
    }, { isolationLevel: 'Serializable' });
    return this.present(entry);
  }

  async pause(id: string, userId: string) {
    const e = await this.ownActive(id, userId);
    if (e.status !== 'running') throw new BadRequestException('Timer is not running');
    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { duration: this.elapsed(e), segmentStart: null, status: 'paused' },
      include: { task: taskSelect },
    });
    return this.present(updated);
  }

  async resume(id: string, userId: string) {
    const e = await this.ownActive(id, userId);
    if (e.status !== 'paused') throw new BadRequestException('Timer is not paused');
    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { segmentStart: new Date(), status: 'running' },
      include: { task: taskSelect },
    });
    return this.present(updated);
  }

  /** Ends the session and saves it as a permanent time entry. */
  async stop(id: string, userId: string, notes?: string) {
    const e = await this.ownActive(id, userId);
    const now = new Date();
    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { duration: this.elapsed(e, now), segmentStart: null, endTime: now, status: 'stopped', ...(notes !== undefined ? { notes } : {}) },
      include: { task: taskSelect },
    });
    await this.syncTaskHours(updated.taskId);
    return this.present(updated);
  }

  /** Discards the active session without recording it. */
  async reset(id: string, userId: string) {
    await this.ownActive(id, userId);
    await this.prisma.timeEntry.delete({ where: { id } });
    return { entry: null };
  }

  async list(userId: string, query: any) {
    const limit = Math.min(parseInt(query.limit ?? '10', 10) || 10, 100);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [entries, today] = await Promise.all([
      this.prisma.timeEntry.findMany({ where: { userId, status: 'stopped' }, include: { task: taskSelect }, orderBy: { endTime: 'desc' }, take: limit }),
      this.prisma.timeEntry.aggregate({ where: { userId, status: 'stopped', endTime: { gte: dayStart } }, _sum: { duration: true } }),
    ]);
    return { entries, todaySeconds: today._sum.duration ?? 0 };
  }
}

@Controller('time-entries')
@UseGuards(JwtAuthGuard)
export class TimeEntriesController {
  constructor(private readonly svc: TimeEntriesService) {}

  @Get('current')
  current(@Request() req: any) {
    return this.svc.current(req.user.id);
  }

  @Get()
  list(@Request() req: any, @Query() query: any) {
    return this.svc.list(req.user.id, query);
  }

  @Post('start')
  start(@Request() req: any, @Body() body: { taskId?: string; notes?: string }) {
    return this.svc.start(req.user, body ?? {});
  }

  @Post(':id/pause')
  pause(@Request() req: any, @Param('id') id: string) {
    return this.svc.pause(id, req.user.id);
  }

  @Post(':id/resume')
  resume(@Request() req: any, @Param('id') id: string) {
    return this.svc.resume(id, req.user.id);
  }

  @Post(':id/stop')
  stop(@Request() req: any, @Param('id') id: string, @Body() body: { notes?: string }) {
    return this.svc.stop(id, req.user.id, body?.notes);
  }

  @Post(':id/reset')
  reset(@Request() req: any, @Param('id') id: string) {
    return this.svc.reset(id, req.user.id);
  }
}

@Module({
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService],
})
export class TimeEntriesModule {}
