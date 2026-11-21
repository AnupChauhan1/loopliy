import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export const TEAM_ORG_SLUG = 'epatang-agency';

export interface BootstrapAccount {
  env: string;
  email: string;
  firstName: string;
  lastName: string;
  roleNames: string[];
  departmentName?: string;
  employeeId?: string;
  designation?: string;
}

/** The four core workspace roles. Passwords come from BOOTSTRAP_* env vars;
 *  accounts are created if missing and only their passwordHash/isActive are
 *  updated if they already exist — no other user data is touched. */
export const BOOTSTRAP_ACCOUNTS: BootstrapAccount[] = [
  {
    env: 'BOOTSTRAP_ADMIN_PASSWORD',
    email: 'admin@epatang.com',
    firstName: 'Admin',
    lastName: 'User',
    roleNames: ['Super Admin'],
    departmentName: 'Operations',
    employeeId: 'DD-001',
    designation: 'System Administrator',
  },
  {
    env: 'BOOTSTRAP_MANAGER_PASSWORD',
    email: 'pm@epatang.com',
    firstName: 'Priya',
    lastName: 'Sharma',
    roleNames: ['Project Manager'],
    departmentName: 'Operations',
    employeeId: 'DD-002',
    designation: 'Project Manager',
  },
  {
    env: 'BOOTSTRAP_HR_PASSWORD',
    email: 'hr@epatang.com',
    firstName: 'Rachel',
    lastName: 'HR',
    roleNames: ['HR Manager'],
    departmentName: 'Operations',
    employeeId: 'DD-003',
    designation: 'HR Manager',
  },
  {
    env: 'BOOTSTRAP_EMPLOYEE_PASSWORD',
    email: 'employee@epatang.com',
    firstName: 'John',
    lastName: 'Doe',
    roleNames: ['Employee', 'Developer'],
    departmentName: 'IT',
    employeeId: 'DD-004',
    designation: 'Software Developer',
  },
];

/** Fallback: a single BOOTSTRAP_TEAM_PASSWORD applies to every account whose
 *  dedicated env var is not set. */
export function resolveBootstrapPasswords(env: NodeJS.ProcessEnv = process.env) {
  const shared = env.BOOTSTRAP_TEAM_PASSWORD;
  return BOOTSTRAP_ACCOUNTS.map((account) => ({
    account,
    password: env[account.env] || shared || '',
  })).filter((entry) => entry.password.length >= 6);
}

export async function bootstrapTeamAccounts(prisma: PrismaClient) {
  const entries = resolveBootstrapPasswords();
  if (entries.length === 0) return { configured: 0, ready: [] as string[] };

  const org = await prisma.organization.findUnique({ where: { slug: TEAM_ORG_SLUG } });
  if (!org) {
    throw new Error(`Organization '${TEAM_ORG_SLUG}' not found — run prisma migrate deploy + seed first.`);
  }

  const departments = await prisma.department.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true },
  });
  const deptByName = new Map(departments.map((d) => [d.name, d.id]));

  const ready: string[] = [];
  for (const { account, password } of entries) {
    const passwordHash = await bcrypt.hash(password, 12);
    const departmentId = account.departmentName ? deptByName.get(account.departmentName) ?? null : null;

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash, isActive: true },
      create: {
        email: account.email,
        passwordHash,
        firstName: account.firstName,
        lastName: account.lastName,
        organizationId: org.id,
        departmentId,
      },
    });

    for (const roleName of account.roleNames) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: { name: roleName },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    if (account.employeeId) {
      await prisma.employeeProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          employeeId: account.employeeId,
          designation: account.designation,
          employmentStatus: 'active',
          dateOfJoining: new Date('2025-01-15'),
          leaveBalance: 20,
        },
      }).catch(() => {});
    }

    ready.push(account.email);
  }

  return { configured: entries.length, ready };
}
