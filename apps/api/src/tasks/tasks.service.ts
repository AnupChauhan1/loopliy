import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { hasAnyRole, MANAGER_ROLES } from '../common/roles';

const ASSIGNEE_INCLUDE = {
  assignees: {
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  },
  project: { select: { id: true, name: true, organizationId: true } },
  department: { select: { id: true, name: true, color: true } },
};

const VALID_STATUSES = ['todo', 'in_progress', 'on_hold', 'in_review', 'changes_requested', 'approved', 'completed', 'cancelled'];

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async generateTaskNumber(): Promise<string> {
    const count = await this.prisma.task.count();
    return `DD-${String(count + 1).padStart(4, '0')}`;
  }

  private isManager(user: any) {
    return hasAnyRole(user, MANAGER_ROLES);
  }

  private isAssignee(task: any, userId: string) {
    return task.assignees?.some((a: any) => a.userId === userId);
  }

  private async getTask(id: string, organizationId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true, assignees: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.project && task.project.organizationId !== organizationId) {
      throw new ForbiddenException('Access denied');
    }
    return task;
  }

  private async changeStatus(taskId: string, fromStatus: string, toStatus: string, userId: string, extra: any = {}) {
    await this.prisma.taskStatusHistory.create({
      data: { taskId, fromStatus, toStatus, changedBy: userId },
    });
    return this.prisma.task.update({
      where: { id: taskId },
      data: { status: toStatus, ...extra },
      include: ASSIGNEE_INCLUDE,
    });
  }

  async create(dto: CreateTaskDto & { assigneeIds?: string[] }, user: any) {
    const organizationId = user.organizationId;
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project || project.organizationId !== organizationId) {
        throw new ForbiddenException('Invalid project or access denied');
      }
    }
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId } });
      if (!dept) throw new ForbiddenException('Invalid department');
    }

    const { assigneeIds, ...fields } = dto;
    const task = await this.prisma.task.create({
      data: {
        ...fields,
        taskNumber: await this.generateTaskNumber(),
        createdById: user.id,
      },
      include: ASSIGNEE_INCLUDE,
    });

    if (assigneeIds?.length) {
      await this.prisma.taskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId: task.id, userId })),
        skipDuplicates: true,
      });
      await this.notifications.notifyMany(
        assigneeIds.filter((id) => id !== user.id),
        'task_assigned',
        'New task assigned',
        `You were assigned "${task.title}" (${task.taskNumber})`,
        `/tasks/${task.id}`,
      );
    }

    await this.prisma.auditLog.create({
      data: { organizationId, userId: user.id, action: 'create', resource: 'task', resourceId: task.id, changes: { title: task.title } },
    });

    return this.findOne(task.id, organizationId);
  }

  async findAll(query: any, user: any) {
    const organizationId = user.organizationId;
    const { status, priority, projectId, departmentId, assigneeId, category, moduleId, search, overdue, page = 1, limit = 50 } = query;

    const where: any = { OR: [{ project: { organizationId } }, { projectId: null }] };
    // Employees only see their own tasks
    if (!this.isManager(user)) {
      where.assignees = { some: { userId: user.id } };
    }
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (projectId) where.projectId = projectId;
    if (departmentId) where.departmentId = departmentId;
    if (category) where.category = category;
    if (moduleId) where.moduleId = moduleId;
    if (assigneeId) where.assignees = { some: { userId: assigneeId } };
    if (overdue === 'true') {
      where.deadline = { lt: new Date() };
      where.status = { notIn: ['completed', 'cancelled', 'approved'] };
    }
    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { taskNumber: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: { ...ASSIGNEE_INCLUDE, checklists: true, _count: { select: { comments: true, attachments: true } } },
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.task.count({ where }),
    ]);

    return { tasks, pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) } };
  }

  async findMyTasks(query: any, user: any) {
    return this.findAll({ ...query, assigneeId: user.id }, { ...user, roles: [{ role: { name: 'Super Admin' } }] });
  }

  async categories(organizationId: string) {
    const rows = await this.prisma.task.findMany({
      where: { category: { not: null }, project: { organizationId } },
      select: { category: true },
      distinct: ['category'],
    });
    return rows.map((r) => r.category).filter(Boolean);
  }

  async findOne(id: string, organizationId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        ...ASSIGNEE_INCLUDE,
        comments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        attachments: true,
        checklists: { orderBy: { order: 'asc' } },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          take: 30,
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.project && task.project.organizationId !== organizationId) throw new ForbiddenException('Access denied');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto & { assigneeIds?: string[] }, user: any) {
    const task = await this.getTask(id, user.organizationId);
    const manager = this.isManager(user);
    const assignee = this.isAssignee(task, user.id);
    if (!manager && !assignee) throw new ForbiddenException('You can only edit tasks assigned to you');

    const { assigneeIds, ...fields } = dto;
    if (!manager) {
      // Employees may only edit description on their own tasks
      const allowed = ['description'];
      for (const key of Object.keys(fields)) {
        if (!allowed.includes(key)) delete (fields as any)[key];
      }
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: fields,
      include: ASSIGNEE_INCLUDE,
    });

    if (assigneeIds && manager) {
      const currentIds = task.assignees.map((a) => a.userId);
      const toAdd = assigneeIds.filter((u) => !currentIds.includes(u));
      const toRemove = currentIds.filter((u) => !assigneeIds.includes(u));
      if (toAdd.length) {
        await this.prisma.taskAssignee.createMany({ data: toAdd.map((userId) => ({ taskId: id, userId })), skipDuplicates: true });
        await this.notifications.notifyMany(toAdd, 'task_assigned', 'Task assigned to you', `"${task.title}" (${task.taskNumber})`, `/tasks/${id}`);
      }
      if (toRemove.length) {
        await this.prisma.taskAssignee.deleteMany({ where: { taskId: id, userId: { in: toRemove } } });
        await this.notifications.notifyMany(toRemove, 'task_unassigned', 'Task unassigned', `You were removed from "${task.title}"`, '/tasks');
      }
    }

    await this.prisma.auditLog.create({
      data: { organizationId: user.organizationId, userId: user.id, action: 'update', resource: 'task', resourceId: id },
    });
    return this.findOne(id, user.organizationId);
  }

  async remove(id: string, user: any) {
    const task = await this.getTask(id, user.organizationId);
    if (!this.isManager(user)) throw new ForbiddenException('Only managers can delete tasks');
    await this.prisma.task.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { organizationId: user.organizationId, userId: user.id, action: 'delete', resource: 'task', resourceId: id, changes: { title: task.title } },
    });
    return { message: 'Task deleted successfully' };
  }

  /** Employee starts work: todo/changes_requested → in_progress */
  async start(id: string, user: any) {
    const task = await this.getTask(id, user.organizationId);
    if (!this.isAssignee(task, user.id) && !this.isManager(user)) throw new ForbiddenException('Not your task');
    if (!['todo', 'changes_requested', 'on_hold'].includes(task.status)) {
      throw new BadRequestException(`Cannot start a task in status "${task.status}"`);
    }
    return this.changeStatus(id, task.status, 'in_progress', user.id, { startDate: task.startDate ?? new Date() });
  }

  /** Employee updates progress % (must be in_progress). */
  async updateProgress(id: string, progress: number, user: any) {
    const task = await this.getTask(id, user.organizationId);
    if (!this.isAssignee(task, user.id) && !this.isManager(user)) throw new ForbiddenException('Not your task');
    if (!['in_progress', 'todo'].includes(task.status)) throw new BadRequestException('Task is not in progress');
    const status = task.status === 'todo' ? 'in_progress' : task.status;
    if (task.status === 'todo') {
      await this.prisma.taskStatusHistory.create({ data: { taskId: id, fromStatus: 'todo', toStatus: 'in_progress', changedBy: user.id } });
    }
    return this.prisma.task.update({ where: { id }, data: { progress: Math.min(100, Math.max(0, progress)), status }, include: ASSIGNEE_INCLUDE });
  }

  /**
   * Employee submits work. If approval required → in_review (notifies reviewers).
   * Otherwise → completed. Returns whether the completion sound should play.
   */
  async submit(id: string, note: string | undefined, user: any) {
    const task = await this.getTask(id, user.organizationId);
    if (!this.isAssignee(task, user.id) && !this.isManager(user)) throw new ForbiddenException('Not your task');
    if (!['in_progress', 'changes_requested'].includes(task.status)) {
      throw new BadRequestException(`Cannot submit a task in status "${task.status}"`);
    }
    if (note) {
      await this.prisma.taskComment.create({ data: { taskId: id, userId: user.id, content: `📤 Submitted for review: ${note}` } });
    }

    if (task.requiresApproval) {
      const updated = await this.changeStatus(id, task.status, 'in_review', user.id, { progress: 100 });
      // Notify reviewers: task creator, project owner, admins/PMs
      const reviewers = await this.notifications.userIdsWithRoles(user.organizationId, MANAGER_ROLES);
      if (task.createdById) reviewers.push(task.createdById);
      await this.notifications.notifyMany(
        reviewers.filter((r) => r !== user.id),
        'task_submitted',
        'Work submitted for review',
        `${user.firstName} submitted "${task.title}" (${task.taskNumber})`,
        `/tasks/${id}`,
      );
      return { task: updated, completed: false, playCompletionSound: false };
    }

    const updated = await this.changeStatus(id, task.status, 'completed', user.id, { progress: 100, completedAt: new Date() });
    if (task.createdById && task.createdById !== user.id) {
      await this.notifications.notify(task.createdById, 'task_completed', 'Task completed', `"${task.title}" (${task.taskNumber}) was completed`, `/tasks/${id}`);
    }
    return { task: updated, completed: true, playCompletionSound: true };
  }

  /** Reviewer decision on submitted work. */
  async review(id: string, action: 'approve' | 'changes', feedback: string | undefined, user: any) {
    const task = await this.getTask(id, user.organizationId);
    if (!this.isManager(user)) throw new ForbiddenException('Only managers can review tasks');
    if (task.status !== 'in_review') throw new BadRequestException('Task is not awaiting review');

    if (action === 'changes') {
      if (!feedback?.trim()) throw new BadRequestException('Feedback is required when requesting changes');
      const updated = await this.changeStatus(id, task.status, 'changes_requested', user.id, { progress: 0 });
      await this.prisma.taskComment.create({ data: { taskId: id, userId: user.id, content: `🔁 Changes requested: ${feedback}` } });
      await this.notifications.notifyMany(
        task.assignees.map((a) => a.userId),
        'changes_requested',
        'Changes requested',
        `"${task.title}": ${feedback}`,
        `/tasks/${id}`,
      );
      return { task: updated, completed: false };
    }

    const updated = await this.changeStatus(id, task.status, 'completed', user.id, { progress: 100, completedAt: new Date() });
    await this.prisma.taskComment.create({ data: { taskId: id, userId: user.id, content: `✅ Approved${feedback ? `: ${feedback}` : ''}` } });
    await this.notifications.notifyMany(
      task.assignees.map((a) => a.userId).filter((u) => u !== user.id),
      'task_approved',
      'Task approved',
      `"${task.title}" (${task.taskNumber}) was approved`,
      `/tasks/${id}`,
    );
    return { task: updated, completed: true };
  }

  /** Generic status change (managers; employees on own tasks for hold/reopen). */
  async updateStatus(id: string, status: string, user: any) {
    if (!VALID_STATUSES.includes(status)) throw new BadRequestException(`Invalid status "${status}"`);
    const task = await this.getTask(id, user.organizationId);
    const manager = this.isManager(user);
    const assignee = this.isAssignee(task, user.id);
    if (!manager && !assignee) throw new ForbiddenException('Not your task');

    // Approval-gated tasks can only reach completed via the review flow
    if (task.requiresApproval && status === 'completed' && !manager) {
      throw new ForbiddenException('This task requires manager approval before completion');
    }
    if (!manager && !['on_hold', 'in_progress', 'todo'].includes(status)) {
      throw new ForbiddenException('Use the submit action to progress this task');
    }

    const completed = status === 'completed';
    return this.changeStatus(id, task.status, status, user.id, {
      completedAt: completed ? new Date() : status === 'in_progress' ? task.completedAt : null,
      progress: completed ? 100 : undefined,
    });
  }

  async addComment(taskId: string, body: { content: string; userId: string }, organizationId: string) {
    await this.getTask(taskId, organizationId);
    return this.prisma.taskComment.create({
      data: { taskId, userId: body.userId, content: body.content },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async addChecklistItem(taskId: string, title: string, user: any) {
    await this.getTask(taskId, user.organizationId);
    const count = await this.prisma.taskChecklist.count({ where: { taskId } });
    return this.prisma.taskChecklist.create({ data: { taskId, title, order: count } });
  }

  async toggleChecklistItem(taskId: string, itemId: string, completed: boolean, user: any) {
    await this.getTask(taskId, user.organizationId);
    return this.prisma.taskChecklist.update({ where: { id: itemId }, data: { completed } });
  }

  async removeChecklistItem(taskId: string, itemId: string, user: any) {
    await this.getTask(taskId, user.organizationId);
    await this.prisma.taskChecklist.delete({ where: { id: itemId } });
    return { message: 'Checklist item removed' };
  }

  async addAttachment(taskId: string, file: { name: string; url: string; size?: number; mimeType?: string }, userId: string, organizationId: string) {
    await this.getTask(taskId, organizationId);
    return this.prisma.taskAttachment.create({
      data: { taskId, name: file.name, url: file.url, size: file.size, mimeType: file.mimeType, uploadedBy: userId },
    });
  }
}
