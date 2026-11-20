export const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  in_review: 'In Review',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled',
  brief: 'Brief',
  internal_review: 'Internal Review',
  client_review: 'Client Review',
  delivered: 'Delivered',
  draft: 'Draft',
  submitted_strategy: 'Submitted for Strategy Approval',
  strategy_changes_requested: 'Strategy Changes Requested',
  strategy_rejected: 'Strategy Rejected',
  pending_manager: 'Pending Manager Approval',
  manager_changes_requested: 'Manager Changes Requested',
  manager_rejected: 'Manager Rejected',
  final_approved: 'Final Approved',
  editing: 'Editing',
};

/*
 * Status palette (green · black · white):
 *   not started → light gray, in motion → soft green, awaiting someone → near-black,
 *   done → solid green, needs attention → white outline, negative outcome → red.
 */
const S_IDLE = 'bg-gray-100 text-gray-700 border-gray-200';
const S_ACTIVE = 'bg-brand-50 text-brand-700 border-brand-200';
const S_WAITING = 'bg-gray-900 text-white border-gray-900';
const S_DONE = 'bg-brand-600 text-white border-brand-600';
const S_ATTENTION = 'bg-white text-gray-900 border-gray-400';
const S_NEGATIVE = 'bg-red-50 text-red-700 border-red-200';

export const STATUS_COLORS: Record<string, string> = {
  todo: S_IDLE,
  brief: S_IDLE,
  on_hold: S_IDLE,
  pending: S_ATTENTION,
  in_progress: S_ACTIVE,
  editing: S_ACTIVE,
  in_review: S_WAITING,
  internal_review: S_WAITING,
  client_review: S_WAITING,
  submitted: S_WAITING,
  changes_requested: S_ATTENTION,
  approved: S_DONE,
  completed: S_DONE,
  delivered: S_DONE,
  final_approved: S_DONE,
  submitted_strategy: S_WAITING,
  pending_manager: S_WAITING,
  strategy_changes_requested: S_ATTENTION,
  manager_changes_requested: S_ATTENTION,
  strategy_rejected: S_NEGATIVE,
  manager_rejected: S_NEGATIVE,
  cancelled: S_NEGATIVE,
  rejected: S_NEGATIVE,
};

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-gray-900 text-white border-gray-900',
  high: 'bg-white text-gray-900 border-gray-400',
  medium: 'bg-brand-50 text-brand-700 border-brand-200',
  low: 'bg-gray-50 text-gray-500 border-gray-200',
};

export function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusColor(s: string) {
  return STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

export function priorityColor(p: string) {
  return PRIORITY_COLORS[p] ?? PRIORITY_COLORS.medium;
}

export function initials(first?: string, last?: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '—';
}

export function fullName(u?: { firstName?: string; lastName?: string } | null) {
  return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '—';
}

export function fmtDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(d?: string | Date | null) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
}

export function isOverdue(d?: string | Date | null, status?: string) {
  if (!d) return false;
  return new Date(d) < new Date() && !['completed', 'cancelled', 'approved', 'final_approved', 'delivered'].includes(status ?? '');
}
