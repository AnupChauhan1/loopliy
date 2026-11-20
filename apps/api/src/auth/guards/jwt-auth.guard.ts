import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { CLIENT_ACCESS_KEY } from '../../common/client-access';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest(err: unknown, user: any, info: unknown, context: ExecutionContext) {
    const authenticatedUser = super.handleRequest(err, user, info, context);
    const hasClientRole = authenticatedUser.roles?.some((userRole: any) => userRole.role?.name === 'Client');
    const isClientAccount = hasClientRole || !!authenticatedUser.clientProfile?.id;
    const clientRoute = this.reflector.getAllAndOverride<boolean>(CLIENT_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isClientAccount && !clientRoute) {
      throw new ForbiddenException('Client accounts can only access the client portal.');
    }

    return authenticatedUser;
  }
}
