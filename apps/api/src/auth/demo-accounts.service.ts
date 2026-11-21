import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

const DEMO_ORG_SLUG = 'loopli-public-demo';
const DEMO_CLIENT_ID = 'public-demo-client-id';

interface DemoAccount {
  env: string;
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
  employeeId?: string;
  designation?: string;
  isClient?: boolean;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    env: 'DEMO_ADMIN_PASSWORD',
    email: 'admin@loopli.com',
    firstName: 'Demo',
    lastName: 'Admin',
    roleName: 'Super Admin',
    employeeId: 'LP-DEMO-001',
    designation: 'Demo Administrator',
  },
  {
    env: 'DEMO_MANAGER_PASSWORD',
    email: 'manager@loopli.com',
    firstName: 'Demo',
    lastName: 'Manager',
    roleName: 'Project Manager',
    employeeId: 'LP-DEMO-002',
    designation: 'Demo Project Manager',
  },
  {
    env: 'DEMO_HR_PASSWORD',
    email: 'hr@loopli.com',
    firstName: 'Demo',
    lastName: 'HR',
    roleName: 'HR Manager',
    employeeId: 'LP-DEMO-003',
    designation: 'Demo HR Manager',
  },
  {
    env: 'DEMO_EMPLOYEE_PASSWORD',
    email: 'employee@loopli.com',
    firstName: 'Demo',
    lastName: 'Employee',
    roleName: 'Employee',
    employeeId: 'LP-DEMO-004',
    designation: 'Demo Designer',
  },
  {
    env: 'DEMO_CLIENT_PASSWORD',
    email: 'client@loopli.com',
    firstName: 'Demo',
    lastName: 'Client',
    roleName: 'Client',
    isClient: true,
  },
];

/**
 * Keeps the public demo accounts in sync with the DEMO_*_PASSWORD env vars on
 * every boot. The one-time `initialDeployHook` seed may have run before those
 * vars were set (or with different values), leaving demo logins broken; this
 * upserts just the demo org, roles and users so credentials always match the
 * configured passwords. All operations are idempotent upserts — no data is
 * deleted and private tenant data is untouched.
 */
@Injectable()
export class DemoAccountsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoAccountsService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const configured = DEMO_ACCOUNTS.filter((a) => !!process.env[a.env]);
    if (configured.length === 0) {
      this.logger.log('No DEMO_*_PASSWORD env vars set — skipping demo account sync.');
      return;
    }

    try {
      const organization = await this.prisma.organization.upsert({
        where: { slug: DEMO_ORG_SLUG },
        update: { name: 'LOOPLI Public Demo' },
        create: { name: 'LOOPLI Public Demo', slug: DEMO_ORG_SLUG },
      });

      const roleNames = [...new Set(configured.map((a) => a.roleName))];
      const roles = new Map<string, string>();
      for (const name of roleNames) {
        const role = await this.prisma.role.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        roles.set(name, role.id);
      }

      for (const account of configured) {
        const passwordHash = await bcrypt.hash(process.env[account.env] as string, 12);
        const user = await this.prisma.user.upsert({
          where: { email: account.email },
          update: {
            passwordHash,
            firstName: account.firstName,
            lastName: account.lastName,
            organizationId: organization.id,
            isActive: true,
          },
          create: {
            email: account.email,
            passwordHash,
            firstName: account.firstName,
            lastName: account.lastName,
            organizationId: organization.id,
          },
        });

        const roleId = roles.get(account.roleName);
        if (roleId) {
          await this.prisma.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId } },
            update: {},
            create: { userId: user.id, roleId },
          });
        }

        if (account.employeeId) {
          await this.prisma.employeeProfile.upsert({
            where: { userId: user.id },
            update: { designation: account.designation, employmentStatus: 'active' },
            create: {
              userId: user.id,
              employeeId: account.employeeId,
              designation: account.designation,
              employmentStatus: 'active',
              dateOfJoining: new Date('2025-01-15'),
              leaveBalance: 20,
            },
          });
        }

        if (account.isClient) {
          const client = await this.prisma.client.upsert({
            where: { id: DEMO_CLIENT_ID },
            update: {
              name: 'Northstar Studio',
              email: account.email,
              status: 'active',
              organizationId: organization.id,
              portalUserId: user.id,
            },
            create: {
              id: DEMO_CLIENT_ID,
              name: 'Northstar Studio',
              email: account.email,
              status: 'active',
              organizationId: organization.id,
              portalUserId: user.id,
            },
          });
          if (client.portalUserId !== user.id) {
            await this.prisma.client.update({
              where: { id: client.id },
              data: { portalUserId: user.id },
            });
          }
        }

        this.logger.log(`Demo account ready: ${account.email} (${account.roleName})`);
      }
    } catch (error) {
      this.logger.error(
        `Demo account sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
