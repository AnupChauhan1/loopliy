import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(@Body() dto: CreateTemplateDto, @Request() req: any) {
    return this.templatesService.create(dto, req.user);
  }

  @Get()
  findAll(@Query() query: any, @Request() req: any) {
    return this.templatesService.findAll(query, req.user);
  }

  @Get('categories')
  categories(@Request() req: any) {
    return this.templatesService.categories(req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.templatesService.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto, @Request() req: any) {
    return this.templatesService.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.templatesService.remove(id, req.user.organizationId);
  }

  @Post(':id/create-issue')
  createFromTemplate(@Param('id') id: string, @Body() dto: { projectId?: string; assignedToId?: string; teamId?: string; dueDate?: string }, @Request() req: any) {
    return this.templatesService.createFromTemplate(id, dto, req.user);
  }
}
