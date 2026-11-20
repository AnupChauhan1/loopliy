import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { priorityColor, statusColor, statusLabel } from '@/lib/format';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-brand-600 text-white',
        secondary: 'border-transparent bg-gray-100 text-gray-800',
        destructive: 'border-transparent bg-red-600 text-white',
        outline: 'border-gray-200 text-gray-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const LIVE_STATUSES = new Set(['in_progress', 'in_review', 'internal_review', 'client_review', 'pending', 'editing', 'submitted_strategy', 'pending_manager']);
const DOT_COLORS: Record<string, string> = {
  todo: 'bg-gray-400',
  brief: 'bg-gray-400',
  in_progress: 'bg-brand-500',
  editing: 'bg-brand-500',
  on_hold: 'bg-gray-500',
  pending: 'bg-gray-500',
  in_review: 'bg-brand-400',
  internal_review: 'bg-brand-400',
  client_review: 'bg-brand-400',
  changes_requested: 'bg-gray-500',
  approved: 'bg-white',
  completed: 'bg-white',
  delivered: 'bg-white',
  present: 'bg-brand-500',
  active: 'bg-brand-500',
  cancelled: 'bg-red-500',
  rejected: 'bg-red-500',
  submitted: 'bg-brand-400',
  submitted_strategy: 'bg-sky-500',
  pending_manager: 'bg-violet-500',
  strategy_changes_requested: 'bg-amber-500',
  manager_changes_requested: 'bg-orange-500',
  strategy_rejected: 'bg-red-500',
  manager_rejected: 'bg-red-500',
  final_approved: 'bg-brand-500',
};

const badgeBase =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-transform duration-200 hover:scale-105';

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const live = LIVE_STATUSES.has(status);
  return (
    <span className={cn(badgeBase, statusColor(status), className)}>
      <span className="relative flex h-1.5 w-1.5">
        {live && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-70', DOT_COLORS[status] ?? 'bg-gray-400')} />}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', DOT_COLORS[status] ?? 'bg-gray-400')} />
      </span>
      {statusLabel(status)}
    </span>
  );
}

const PRIORITY_BARS: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4 };

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const level = PRIORITY_BARS[priority] ?? 2;
  return (
    <span className={cn(badgeBase, 'capitalize', priorityColor(priority), className)}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('w-[2.5px] rounded-full bg-current', i <= level ? 'opacity-90' : 'opacity-20')} style={{ height: 3 + i * 1.5 }} />
        ))}
      </span>
      {priority}
    </span>
  );
}

/** Small neutral pill (roles, tags, counts). */
export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full bg-gray-100/90 px-2 py-0.5 text-[10.5px] font-semibold text-gray-600 ring-1 ring-gray-200/70', className)}>
      {children}
    </span>
  );
}
