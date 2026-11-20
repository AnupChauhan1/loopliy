import { Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, PRIVILEGED_ROLES, roleNamesOf } from '../common/roles';

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  async list(organizationId: string, user: any) {
    const modules = await this.prisma.moduleConfig.findMany({
      where: { organizationId },
      orderBy: { menuPosition: 'asc' },
    });
    // Non-privileged users only see modules their roles allow
    if (user) {
      const names = roleNamesOf(user);
      if (!names.some((n) => PRIVILEGED_ROLES.includes(n))) {
        return modules.filter((m) => {
          const allowed = (m.roles as string[]) || [];
          return allowed.length === 0 || names.some((n) => allowed.includes(n));
        });
      }
    }
    return modules;
  }

  async create(data: any, user: any) {
    const key = (data.key || data.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '').trim();
    if (!key) throw new ConflictException('Module key is required');
    const existing = await this.prisma.moduleConfig.findUnique({
      where: { organizationId_key: { organizationId: user.organizationId, key } },
    });
    if (existing) throw new ConflictException('A module with this key already exists');
    const mod = await this.prisma.moduleConfig.create({
      data: {
        key, name: data.name, description: data.description, icon: data.icon,
        roles: data.roles ?? [], departmentIds: data.departmentIds ?? [],
        menuPosition: data.menuPosition ?? 100, status: data.status || 'active',
        fields: data.fields, permissions: data.permissions,
        organizationId: user.organizationId, createdById: user.id,
      },
    });
    await this.prisma.auditLog.create({
      data: { organizationId: user.organizationId, userId: user.id, action: 'create', resource: 'module', resourceId: mod.id, changes: { name: mod.name } },
    });
    return mod;
  }

  async update(id: string, data: any, user: any) {
    const mod = await this.prisma.moduleConfig.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!mod) throw new NotFoundException('Module not found');
    const updated = await this.prisma.moduleConfig.update({
      where: { id },
      data: {
        name: data.name, description: data.description, icon: data.icon,
        roles: data.roles, departmentIds: data.departmentIds,
        menuPosition: data.menuPosition, status: data.status,
        fields: data.fields, permissions: data.permissions,
      },
    });
    await this.prisma.auditLog.create({
      data: { organizationId: user.organizationId, userId: user.id, action: 'update', resource: 'module', resourceId: id },
    });
    return updated;
  }

  async remove(id: string, user: any) {
    const mod = await this.prisma.moduleConfig.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!mod) throw new NotFoundException('Module not found');
    await this.prisma.moduleConfig.update({ where: { id }, data: { status: 'archived' } });
    await this.prisma.auditLog.create({
      data: { organizationId: user.organizationId, userId: user.id, action: 'archive', resource: 'module', resourceId: id },
    });
    return { message: 'Module archived' };
  }
}

@Controller('modules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}

  @Get()
  list(@Request() req: any) {
    return this.modules.list(req.user.organizationId, req.user);
  }

  @Post()
  @Roles(...PRIVILEGED_ROLES)
  create(@Body() body: any, @Request() req: any) {
    return this.modules.create(body, req.user);
  }

  @Put(':id')
  @Roles(...PRIVILEGED_ROLES)
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.modules.update(id, body, req.user);
  }

  @Delete(':id')
  @Roles(...PRIVILEGED_ROLES)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.modules.remove(id, req.user);
  }
}

@Module({
  controllers: [ModulesController],
  providers: [ModulesService],
})
export class ModulesModule {}
