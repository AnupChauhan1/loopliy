import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  Type,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Roles that have unrestricted access to everything. */
export const PRIVILEGED_ROLES = ['Super Admin', 'Admin'];
export const MANAGER_ROLES = [...PRIVILEGED_ROLES, 'Project Manager'];
export const HR_ROLES = [...PRIVILEGED_ROLES, 'HR Manager'];
export const ALL_STAFF_ROLES = [...MANAGER_ROLES, 'HR Manager', 'Employee'];

export function roleNamesOf(user: any): string[] {
  if (!user?.roles) return [];
  return user.roles.map((ur: any) => ur.role?.name).filter(Boolean);
}

export function hasAnyRole(user: any, roles: string[]): boolean {
  const names = roleNamesOf(user);
  return names.some((n) => roles.includes(n));
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');
    if (!hasAnyRole(user, required)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }
    return true;
  }
}

/** Combined JWT auth + role guard. Apply `@Roles(...)` on the handler. */
export const StaffGuard = (): Type<CanActivate> => {
  @Injectable()
  class JwtRolesGuard extends JwtAuthGuard {}
  return JwtRolesGuard;
};

export const CurrentUser = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user;
  return data ? user?.[data] : user;
});
