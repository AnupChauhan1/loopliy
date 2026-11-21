import { PrismaClient } from '@prisma/client';

export const DEMO_ORG_SLUG = 'loopli-public-demo';
export const SEED_PURGE_KEY = 'seed-data-purge-complete';

/** Seeded persona accounts (never real employees). The bootstrap admin
 *  admin@epatang.com is deliberately excluded so at least one login
 *  always remains. */
const SEED_USER_EMAILS = [
  'pm@epatang.com',
  'hr@epatang.com',
  'employee@epatang.com',
  'designer@epatang.com',
  'editor@epatang.com',
  'sales@epatang.com',
  'client@acme.com',
  'client@loopli.com',
];

/**
 * Business-data tables wiped by the one-time seed-data purge. Identity,
 * organization structure, roles, departments, employee profiles, module
 * registry, org settings and per-user preferences are intentionally
 * preserved — only transactional/business records are removed.
 */
const PURGE_TABLES = [
  'Lead', 'Deal', 'FollowUp', 'Proposal', 'Contract', 'Client', 'ClientContact',
  'ClientService', 'Project', 'ProjectMember', 'Milestone', 'Deliverable',
  'ProjectFile', 'Task', 'TaskAssignee', 'TaskDependency', 'TaskComment',
  'TaskAttachment', 'TaskChecklist', 'TimeEntry', 'TaskStatusHistory',
  'SocialAccount', 'ContentPost', 'PostPlatform', 'PostVersion', 'MediaAsset',
  'ApprovalRequest', 'ApprovalEvent', 'PublishJob', 'PublishingLog',
  'Conversation', 'ConversationMember', 'Message', 'Call', 'CallParticipant',
  'Meeting', 'MeetingParticipant', 'AttendanceRecord', 'AttendanceSession',
  'AttendanceCorrection', 'LeaveRequest', 'Invoice', 'InvoiceItem', 'Payment',
  'Expense', 'Retainer', 'Notification', 'WorkflowRun', 'AuditLog',
  'WebhookEvent', 'BackgroundJob', 'CreativeRequest', 'CreativeVersion',
  'CreativeApprovalEvent', 'VideoRequest', 'VideoVersion', 'Announcement',
  'Holiday', 'Issue', 'IssueAttachment', 'IssueComment', 'IssueActivity',
];

/** Remove every business record (clients, projects, tasks, invoices, etc.)
 *  while preserving users, roles, departments and configuration. Uses
 *  TRUNCATE ... CASCADE so foreign-key ordering is handled by Postgres. */
export async function purgeSeedBusinessData(prisma: PrismaClient) {
  const tables = PURGE_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  await prisma.user.deleteMany({ where: { email: { in: SEED_USER_EMAILS } } });
}

/** Delete the isolated public-demo organization. Its users, roles links,
 *  profiles and org-scoped rows cascade; real tenant data is untouched.
 *  Returns true when the org existed. */
export async function deleteDemoOrganization(prisma: PrismaClient) {
  const org = await prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG } });
  if (!org) return false;
  await prisma.organization.delete({ where: { id: org.id } });
  return true;
}
