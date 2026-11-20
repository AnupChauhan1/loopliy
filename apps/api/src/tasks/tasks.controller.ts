import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const uploadStorage = diskStorage({
  destination: './uploads',
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Body() dto: CreateTaskDto & { assigneeIds?: string[] }, @Request() req: any) {
    return this.tasksService.create(dto, req.user);
  }

  @Get()
  findAll(@Query() query: any, @Request() req: any) {
    return this.tasksService.findAll(query, req.user);
  }

  @Get('my')
  findMyTasks(@Query() query: any, @Request() req: any) {
    return this.tasksService.findMyTasks(query, req.user);
  }

  @Get('categories')
  categories(@Request() req: any) {
    return this.tasksService.categories(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto & { assigneeIds?: string[] }, @Request() req: any) {
    return this.tasksService.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.remove(id, req.user);
  }

  // ---- Workflow actions ----

  @Post(':id/start')
  start(@Param('id') id: string, @Request() req: any) {
    return this.tasksService.start(id, req.user);
  }

  @Post(':id/progress')
  progress(@Param('id') id: string, @Body('progress') progress: number, @Request() req: any) {
    return this.tasksService.updateProgress(id, Number(progress), req.user);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @Body('note') note: string | undefined, @Request() req: any) {
    return this.tasksService.submit(id, note, req.user);
  }

  @Post(':id/review')
  review(@Param('id') id: string, @Body() body: { action: 'approve' | 'changes'; feedback?: string }, @Request() req: any) {
    return this.tasksService.review(id, body.action, body.feedback, req.user);
  }

  @Post(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: any) {
    return this.tasksService.updateStatus(id, status, req.user);
  }

  // ---- Comments / checklist / attachments ----

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() body: { content: string }, @Request() req: any) {
    return this.tasksService.addComment(id, { content: body.content, userId: req.user.id }, req.user.organizationId);
  }

  @Post(':id/checklist')
  addChecklistItem(@Param('id') id: string, @Body('title') title: string, @Request() req: any) {
    return this.tasksService.addChecklistItem(id, title, req.user);
  }

  @Put(':id/checklist/:itemId')
  toggleChecklistItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body('completed') completed: boolean, @Request() req: any) {
    return this.tasksService.toggleChecklistItem(id, itemId, completed === true || String(completed) === 'true', req.user);
  }

  @Delete(':id/checklist/:itemId')
  removeChecklistItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req: any) {
    return this.tasksService.removeChecklistItem(id, itemId, req.user);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage, limits: { fileSize: 200 * 1024 * 1024 } }))
  uploadAttachment(@Param('id') id: string, @UploadedFile() file: any, @Request() req: any) {
    return this.tasksService.addAttachment(
      id,
      { name: file.originalname, url: `/uploads/${file.filename}`, size: file.size, mimeType: file.mimetype },
      req.user.id,
      req.user.organizationId,
    );
  }
}
