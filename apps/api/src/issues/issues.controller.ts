import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { IssuesService } from './issues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

@Controller('issues')
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  create(@Body() dto: CreateIssueDto, @Request() req: any) {
    return this.issuesService.create(dto, req.user);
  }

  @Get()
  findAll(@Query() query: any, @Request() req: any) {
    return this.issuesService.findAll(query, req.user);
  }

  @Get('my')
  findMyIssues(@Query() query: any, @Request() req: any) {
    return this.issuesService.findMyIssues(query, req.user);
  }

  @Get('categories')
  categories(@Request() req: any) {
    return this.issuesService.categories(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.issuesService.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIssueDto, @Request() req: any) {
    return this.issuesService.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.issuesService.remove(id, req.user.organizationId);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() dto: { content: string }, @Request() req: any) {
    return this.issuesService.addComment(id, dto.content, req.user);
  }

  @Post(':id/attachments')
  addAttachment(@Param('id') id: string, @Body() dto: { name: string; url: string; size?: number; mimeType?: string }, @Request() req: any) {
    return this.issuesService.addAttachment(id, dto, req.user);
  }

  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: { status: string }, @Request() req: any) {
    return this.issuesService.updateStatus(id, dto.status, req.user);
  }

  @Post('bulk')
  bulkUpdate(@Body() dto: { ids: string[]; updates: Partial<UpdateIssueDto> }, @Request() req: any) {
    return this.issuesService.bulkUpdate(dto.ids, dto.updates, req.user);
  }
}
