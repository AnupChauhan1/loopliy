import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientAccess } from '../common/client-access';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { hasAnyRole } from '../common/roles';

const PRIVILEGED_ROLES = ['Super Admin', 'Admin'];

@Controller('chat')
@UseGuards(JwtAuthGuard)
@ClientAccess()
export class ChatController {
  constructor(private readonly chat: ChatService, private readonly gateway: ChatGateway) {}

  /** Client portal accounts may only use conversations they already belong
   *  to — they cannot start DMs/groups or browse the staff directory. */
  private assertNotClient(req: any) {
    const isClient =
      req.user?.roles?.some((ur: any) => ur?.role?.name === 'Client' || ur === 'Client') ||
      !!req.user?.clientProfile?.id ||
      req.user?.primaryRole === 'Client';
    if (isClient) {
      throw new ForbiddenException('Client accounts can only use their portal conversations.');
    }
  }

  @Get('conversations')
  conversations(@Request() req: any) {
    return this.chat.conversationsForUser(req.user.id);
  }

  @Post('conversations/direct')
  direct(@Body() body: { userId: string }, @Request() req: any) {
    this.assertNotClient(req);
    return this.chat.getOrCreateDirect(req.user.id, body.userId);
  }

  @Post('conversations/group')
  group(@Body() body: { name?: string; memberIds: string[]; projectId?: string }, @Request() req: any) {
    this.assertNotClient(req);
    return this.chat.createGroup({ ...body, userId: req.user.id });
  }

  @Get('conversations/:id/messages')
  messages(
    @Param('id') id: string,
    @Query('before') before: string | undefined,
    @Query('take') take: string | undefined,
    @Request() req: any,
  ) {
    return this.chat.messages(id, req.user.id, {
      before,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() body: { content?: string; attachments?: unknown; replyToId?: string },
    @Request() req: any,
  ) {
    const { message, memberIds } = await this.chat.sendMessage(id, req.user.id, body);
    await this.gateway.dispatchMessage(id, message, memberIds, req.user.id);
    return { message };
  }

  @Post('conversations/:id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.chat.markRead(id, req.user.id);
  }

  @Get('conversations/:id/search')
  search(@Param('id') id: string, @Query('q') q: string, @Request() req: any) {
    return this.chat.searchMessages(id, req.user.id, q ?? '');
  }

  @Patch('messages/:id')
  editMessage(@Param('id') id: string, @Body() body: { content: string }, @Request() req: any) {
    return this.chat.editMessage(id, req.user.id, body.content);
  }

  @Delete('messages/:id')
  deleteMessage(@Param('id') id: string, @Request() req: any) {
    return this.chat.deleteMessage(id, req.user.id, hasAnyRole(req.user, PRIVILEGED_ROLES));
  }

  @Post('messages/:id/pin')
  pinMessage(@Param('id') id: string, @Request() req: any) {
    return this.chat.togglePin(id, req.user.id, hasAnyRole(req.user, PRIVILEGED_ROLES));
  }

  @Get('users')
  users(@Query('q') q: string | undefined, @Request() req: any) {
    this.assertNotClient(req);
    return this.chat.chatUsers(req.user.organizationId, q, req.user.id);
  }

  @Get('calls/history')
  callHistory(@Request() req: any) {
    return this.chat.callHistory(req.user.id);
  }

  @Post('calls')
  createCall(
    @Body() body: { conversationId: string; type: 'audio' | 'video'; participantIds?: string[] },
    @Request() req: any,
  ) {
    return this.chat.createCall({
      conversationId: body.conversationId,
      type: body.type,
      initiatedById: req.user.id,
      participantIds: body.participantIds ?? [],
    });
  }

  @Post('calls/:id/status')
  callStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'ended' | 'missed' | 'declined' }, @Request() req: any) {
    return this.chat.updateCallStatus(id, req.user.id, body.status);
  }

  @Get('unread')
  unread(@Request() req: any) {
    return this.chat.unreadTotal(req.user.id);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'chat');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
          cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = /^(image\/|video\/|audio\/|text\/|application\/(pdf|msword|officedocument|vnd\.|zip|x-zip|json))/.test(file.mimetype);
        cb(allowed ? null : new BadRequestException('File type not allowed'), allowed);
      },
    }),
  )
  upload(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('No file uploaded');
    return {
      url: `/uploads/chat/${file.filename}`,
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
