import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

const ISSUE_INCLUDE = {
  project: { select: { id: true, name: true } },
  template: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true } },
  createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
  attachments: true,
  comments: {
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  activities: {
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTemplateDto, user: any) {
    const organizationId = user.organizationId;
    
    return this.prisma.issueTemplate.create({
      data: {
        ...dto,
        organizationId,
      },
      include: {
        department: true,
      },
    });
  }

  async findAll(query: any, user: any) {
    const organizationId = user.organizationId;
    const { category, departmentId } = query;
    
    const where: any = { organizationId, isActive: true };
    if (category) where.category = category;
    if (departmentId) where.departmentId = departmentId;
    
    const templates = await this.prisma.issueTemplate.findMany({
      where,
      include: {
        department: true,
        _count: {
          select: { issues: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return { templates };
  }

  async categories(organizationId: string) {
    const templates = await this.prisma.issueTemplate.findMany({
      where: { organizationId, isActive: true },
      select: { category: true },
      distinct: ['category'],
    });
    
    return templates
      .map(t => t.category)
      .filter((c): c is string => !!c);
  }

  async findOne(id: string, organizationId: string) {
    const template = await this.prisma.issueTemplate.findFirst({
      where: { id, organizationId },
      include: {
        department: true,
        _count: {
          select: { issues: true },
        },
      },
    });
    
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    
    return template;
  }

  async update(id: string, dto: UpdateTemplateDto, user: any) {
    const organizationId = user.organizationId;
    
    const template = await this.prisma.issueTemplate.findFirst({
      where: { id, organizationId },
    });
    
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    
    return this.prisma.issueTemplate.update({
      where: { id },
      data: dto,
      include: {
        department: true,
      },
    });
  }

  async remove(id: string, organizationId: string) {
    const template = await this.prisma.issueTemplate.findFirst({
      where: { id, organizationId },
    });
    
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    
    return this.prisma.issueTemplate.delete({
      where: { id },
    });
  }

  async createFromTemplate(id: string, dto: any, user: any) {
    const organizationId = user.organizationId;
    
    const template = await this.prisma.issueTemplate.findFirst({
      where: { id, organizationId },
    });
    
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    
    const issue = await this.prisma.issue.create({
      data: {
        title: template.name,
        description: template.description,
        category: template.category,
        priority: template.defaultPriority,
        status: template.defaultStatus,
        organizationId,
        projectId: dto.projectId,
        assignedToId: dto.assignedToId,
        teamId: dto.teamId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        createdById: user.id,
      },
      include: ISSUE_INCLUDE,
    });
    
    return issue;
  }
}
