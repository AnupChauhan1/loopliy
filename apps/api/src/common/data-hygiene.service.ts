import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SEED_PURGE_KEY,
  deleteDemoOrganization,
  purgeSeedBusinessData,
} from './seed-purge';

/**
 * Production data hygiene, runs once per boot:
 *
 * 1. Always removes the isolated 'loopli-public-demo' organization (demo
 *    sandbox accounts can never log in).
 * 2. When PURGE_SEED_DATA=true, performs a one-time purge of all seeded
 *    business data (clients, projects, tasks, invoices, attendance, etc.)
 *    while preserving users, roles, departments and configuration. A
 *    SystemState marker guarantees it can never run twice, so real
 *    user-generated data created afterwards is safe even if the env var
 *    is left set.
 */
@Injectable()
export class DataHygieneService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DataHygieneService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      const removed = await deleteDemoOrganization(this.prisma);
      if (removed) {
        this.logger.log("Removed demo organization 'loopli-public-demo'");
      }

      if (process.env.PURGE_SEED_DATA !== 'true') return;

      const marker = await this.prisma.systemState.findUnique({ where: { key: SEED_PURGE_KEY } });
      if (marker) {
        this.logger.log('Seed-data purge already completed — skipping.');
        return;
      }

      await purgeSeedBusinessData(this.prisma);
      await this.prisma.systemState.upsert({
        where: { key: SEED_PURGE_KEY },
        update: { value: new Date().toISOString() },
        create: { key: SEED_PURGE_KEY, value: new Date().toISOString() },
      });
      this.logger.warn('Purged all seeded business data (users, roles and configuration preserved).');
    } catch (error) {
      this.logger.error(
        `Data hygiene failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
