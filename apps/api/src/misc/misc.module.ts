import { Controller, Get, Injectable, Module, Query, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, PRIVILEGED_ROLES } from '../common/roles';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async list(organizationId: string, query: any) {
    const { resource, userId, search, page = 1, limit = 50 } = query;
    const where: any = { organizationId };
    if (resource) where.resource = resource;
    if (userId) where.userId = userId;
    if (search) where.OR = [{ action: { contains: search, mode: 'insensitive' } }, { resource: { contains: search, mode: 'insensitive' } }];
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: parseInt(limit) }),
      this.prisma.auditLog.count({ where }),
    ]);
    // Resolve user names
    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    return {
      logs: logs.map((l) => ({ ...l, user: l.userId ? userMap[l.userId] : null })),
      pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) },
    };
  }
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class MiscController {
  constructor(private readonly audit: AuditService) {}

  @Get('audit-logs')
  @Roles(...PRIVILEGED_ROLES)
  auditLogs(@Request() req: any, @Query() query: any) {
    return this.audit.list(req.user.organizationId, query);
  }
}

@Module({
  controllers: [MiscController],
  providers: [AuditService],
})
export class MiscModule {}
