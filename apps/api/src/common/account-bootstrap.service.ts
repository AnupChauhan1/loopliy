import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { bootstrapTeamAccounts } from './account-bootstrap';

/**
 * Optional team-account bootstrap. When BOOTSTRAP_ADMIN_PASSWORD /
 * BOOTSTRAP_MANAGER_PASSWORD / BOOTSTRAP_HR_PASSWORD /
 * BOOTSTRAP_EMPLOYEE_PASSWORD (or the shared BOOTSTRAP_TEAM_PASSWORD) env
 * vars are set, the four core workspace accounts are created if missing and
 * their passwords reset on every boot — without touching any other user
 * data. Unset env vars simply skip the bootstrap.
 */
@Injectable()
export class AccountBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccountBootstrapService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      const result = await bootstrapTeamAccounts(this.prisma);
      if (result.configured > 0) {
        this.logger.log(`Bootstrap accounts ready: ${result.ready.join(', ')}`);
      }
    } catch (error) {
      this.logger.error(
        `Account bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
