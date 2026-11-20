import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientAccess } from '../common/client-access';
import { Roles, RolesGuard, MANAGER_ROLES, PRIVILEGED_ROLES } from '../common/roles';
import { ClientMessageDto } from './dto/client-message.dto';
import { CreateClientDto, CreateClientPortalAccountDto } from './dto/create-client.dto';
import { ClientReviewDto } from './dto/client-review.dto';
import { ClientPortalService } from './client-portal.service';

@Controller('client-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@ClientAccess()
export class ClientPortalController {
  constructor(private readonly clientPortal: ClientPortalService) {}

  @Get('dashboard')
  @Roles('Client')
  dashboard(@Request() req: any) {
    return this.clientPortal.dashboard(req.user);
  }

  @Get('messages')
  @Roles('Client')
  messages(@Request() req: any) {
    return this.clientPortal.clientMessages(req.user);
  }

  @Post('messages')
  @Roles('Client')
  sendMessage(@Body() body: ClientMessageDto, @Request() req: any) {
    return this.clientPortal.sendClientMessage(body.content, req.user);
  }

  @Post('deliverables/:kind/:id/versions/:versionId/review')
  @Roles('Client')
  reviewDeliverable(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() body: ClientReviewDto,
    @Request() req: any,
  ) {
    return this.clientPortal.reviewDeliverable(kind, id, versionId, body.action, body.feedback, req.user);
  }

  @Get('files/:fileId')
  @Roles('Client')
  async projectFile(@Param('fileId') fileId: string, @Request() req: any, @Res() response: Response) {
    const file = await this.clientPortal.projectFile(fileId, req.user);
    return this.sendFile(file, response);
  }

  @Get('deliverables/:kind/:id/versions/:versionId/file')
  @Roles('Client')
  async deliverableFile(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Request() req: any,
    @Res() response: Response,
  ) {
    const file = await this.clientPortal.deliverableFile(kind, id, versionId, req.user);
    return this.sendFile(file, response);
  }

  @Get('clients')
  @Roles(...PRIVILEGED_ROLES)
  listClients(@Request() req: any) {
    return this.clientPortal.listClients(req.user.organizationId);
  }

  @Post('clients')
  @Roles(...PRIVILEGED_ROLES)
  createClient(@Body() body: CreateClientDto, @Request() req: any) {
    return this.clientPortal.createClient(body, req.user);
  }

  @Post('clients/:clientId/account')
  @Roles(...PRIVILEGED_ROLES)
  createClientAccount(
    @Param('clientId') clientId: string,
    @Body() body: CreateClientPortalAccountDto,
    @Request() req: any,
  ) {
    return this.clientPortal.createClientAccount(clientId, body, req.user);
  }

  @Get('conversations')
  @Roles(...MANAGER_ROLES)
  conversations(@Request() req: any) {
    return this.clientPortal.conversations(req.user);
  }

  @Get('conversations/:conversationId/messages')
  @Roles(...MANAGER_ROLES)
  staffMessages(@Param('conversationId') conversationId: string, @Request() req: any) {
    return this.clientPortal.staffMessages(conversationId, req.user);
  }

  @Post('conversations/:conversationId/messages')
  @Roles(...MANAGER_ROLES)
  sendStaffMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: ClientMessageDto,
    @Request() req: any,
  ) {
    return this.clientPortal.sendStaffMessage(conversationId, body.content, req.user);
  }

  private sendFile(file: any, response: Response) {
    if (file.redirectUrl) return response.redirect(file.redirectUrl);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return response.sendFile(file.filePath);
  }
}
