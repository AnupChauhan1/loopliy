import { Body, Controller, Delete, Get, Module, Param, Post, Put, Query, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, MANAGER_ROLES } from '../common/roles';
import { CreativesService } from './creative.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const uploadStorage = diskStorage({
  destination: './uploads',
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});

@Injectable()
export class VideosService extends CreativesService {
  constructor(prisma: PrismaService, notifications: NotificationsService) {
    super(prisma, notifications);
  }
  protected model(): any { return this.prisma.videoRequest; }
  protected versionModel(): any { return this.prisma.videoVersion; }
  protected notifPrefix() { return 'video'; }
}

@Controller('videos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  list(@Request() req: any, @Query() query: any) {
    return this.videos.list(req.user.organizationId, query, req.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Request() req: any) {
    return this.videos.detail(id, req.user.organizationId);
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.videos.create(body, req.user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.videos.update(id, body, req.user);
  }

  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage, limits: { fileSize: 1024 * 1024 * 1024 } }))
  uploadVersion(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() body: { notes?: string; externalUrl?: string; duration?: number },
    @Request() req: any,
  ) {
    return this.videos.uploadVersion(
      id,
      file
        ? { fileUrl: `/uploads/${file.filename}`, fileName: file.originalname, mimeType: file.mimetype, size: file.size, notes: body.notes, duration: body.duration ? Number(body.duration) : undefined }
        : { externalUrl: body.externalUrl, notes: body.notes, duration: body.duration ? Number(body.duration) : undefined },
      req.user,
    );
  }

  @Post(':id/versions/:versionId/review')
  @Roles(...MANAGER_ROLES)
  reviewVersion(@Param('id') id: string, @Param('versionId') versionId: string, @Body() body: { action: 'approve' | 'reject' | 'changes'; feedback?: string }, @Request() req: any) {
    return this.videos.reviewVersion(id, versionId, body.action, body.feedback, req.user);
  }

  @Post(':id/deliver')
  @Roles(...MANAGER_ROLES)
  deliver(@Param('id') id: string, @Request() req: any) {
    return this.videos.markDelivered(id, req.user);
  }

  @Delete(':id')
  @Roles(...MANAGER_ROLES)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.videos.remove(id, req.user);
  }
}

@Module({
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
