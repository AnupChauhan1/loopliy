import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

interface RequestWithUser extends Request {
  user: {
    id: string;
    email: string;
    organizationId: string;
  };
}

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() createProjectDto: CreateProjectDto, @Request() req: RequestWithUser) {
    return this.projectsService.create(createProjectDto, req.user.id, req.user.organizationId);
  }

  @Get()
  findAll(@Query() query: any, @Request() req: RequestWithUser) {
    return this.projectsService.findAll(query, req.user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.projectsService.findOne(id, req.user.organizationId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateProjectDto: UpdateProjectDto, @Request() req: RequestWithUser) {
    return this.projectsService.update(id, updateProjectDto, req.user.id, req.user.organizationId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.projectsService.remove(id, req.user.id, req.user.organizationId);
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body('userId') userId: string, @Request() req: RequestWithUser) {
    return this.projectsService.addMember(id, userId, req.user.id, req.user.organizationId);
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @Request() req: RequestWithUser) {
    return this.projectsService.removeMember(id, userId, req.user.id, req.user.organizationId);
  }
}
