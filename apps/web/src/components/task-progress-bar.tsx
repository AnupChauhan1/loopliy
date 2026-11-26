'use client';

import { cn } from '@/lib/utils';

const DONE = ['completed', 'approved'];

function stageOf(status?: string | null, progress = 0, creativeStage?: number | null): number {
  if (creativeStage != null && creativeStage > 0) return Math.min(4, creativeStage);
  if (DONE.includes(status ?? '') || progress >= 100) return 4;
  if (status === 'client_review' || progress >= 85) return 3;
  if (status === 'in_review' || progress >= 65) return 2;
  if (status === 'in_progress' || status === 'changes_requested' || progress >= 35) return 1;
  return 0;
}

const BAR_STYLE: Record<number, string> = {
  0: 'from-slate-400 to-slate-500',
  1: 'from-sky-400 to-emerald-500',
  2: 'from-amber-400 to-emerald-500',
  3: 'from-violet-400 to-emerald-500',
  4: 'from-emerald-500 to-emerald-600',
};

const MILESTONES = ['Created', 'Strategist', 'Client', 'Posted'];

/** Sleek status-aware progress bar with % pill and 4-dot creative milestone stepper. */
export function TaskProgressBar({
  status,
  progress = 0,
  creativeStage,
  compact = false,
  className,
}: {
  status?: string | null;
  progress?: number;
  creativeStage?: number | null;
  compact?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, progress ?? 0));
  const stage = stageOf(status, pct, creativeStage);
  const done = DONE.includes(status ?? '') || pct >= 100;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-2">
        <div className={cn('flex-1 overflow-hidden rounded-full bg-slate-100', compact ? 'h-1.5' : 'h-2')}>
          <div
            className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', BAR_STYLE[stage])}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn('shrink-0 rounded-full px-1.5 py-px font-bold tabular-nums', done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500', compact ? 'text-[9px]' : 'text-[10px]')}>
          {pct}%
        </span>
      </div>
      {/* 4-dot milestone stepper */}
      <div className="mt-1 flex items-center gap-1" title={MILESTONES.map((m, i) => `${i + 1}. ${m}`).join(' → ')}>
        {MILESTONES.map((m, i) => (
          <span
            key={m}
            className={cn('h-1.5 rounded-full transition-all', i < stage ? 'w-3 bg-emerald-500' : i === stage - 1 || (stage === 0 && i === 0) ? 'w-3 bg-slate-300' : 'w-1.5 bg-slate-200')}
          />
        ))}
        {!compact && <span className="ml-1 text-[9px] font-medium text-slate-400">{stage === 0 ? 'To Do' : MILESTONES[stage - 1]}</span>}
      </div>
    </div>
  );
}
