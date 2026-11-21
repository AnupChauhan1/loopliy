'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Eye, List, Play } from 'lucide-react';
import { useTaskStatus, type ChartPeriod } from '@/lib/hooks/dashboard';
import { cn } from '@/lib/utils';

const PERIODS: { value: ChartPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_META: Record<string, { label: string; icon: React.ElementType; bar: string; chip: string; card: string }> = {
  todo: { label: 'To Do', icon: List, bar: 'from-[#9FE3C8] to-[#5CC7A5]', chip: 'bg-[#E8F8F2] text-[#007F5F]', card: 'border-[#C9F0E2] bg-[#F4FCF8]' },
  in_progress: { label: 'In Progress', icon: Play, bar: 'from-[#5BD3A8] to-[#12A87F]', chip: 'bg-[#DCF5EA] text-[#00855F]', card: 'border-[#B9EBD8] bg-[#EDFAF4]' },
  in_review: { label: 'In Review', icon: Eye, bar: 'from-[#3BAF8C] to-[#00936A]', chip: 'bg-[#CDEEE0] text-[#006B4E]', card: 'border-[#A8E2CF] bg-[#E4F8F0]' },
  completed: { label: 'Completed', icon: Check, bar: 'from-[#25A17E] to-[#00654C]', chip: 'bg-[#B7E4D2] text-[#003A2C]', card: 'border-[#8FD6BE] bg-[#D9F4E9]' },
};
const KEYS = ['todo', 'in_progress', 'in_review', 'completed'] as const;

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

export function StatusChart() {
  const router = useRouter();
  const [period, setPeriod] = useState<ChartPeriod>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [animate, setAnimate] = useState(false);

  const pickPeriod = (p: ChartPeriod) => {
    setPeriod(p);
    if (p === 'custom' && (!customFrom || !customTo)) {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      setCustomFrom(toISODate(from));
      setCustomTo(toISODate(to));
    }
  };

  const { data, isLoading, isError } = useTaskStatus(
    period,
    period === 'custom' ? customFrom : undefined,
    period === 'custom' ? customTo : undefined,
  );

  const rows = useMemo(() => {
    const byStatus = data?.byStatus ?? {};
    const total = data?.total ?? 0;
    return KEYS.map((key) => {
      const value = byStatus[key] ?? 0;
      return { key, value, pct: total > 0 ? Math.round((value / total) * 100) : null };
    });
  }, [data]);

  const total = data?.total ?? 0;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const axisMax = Math.max(max * 1.15, 1);

  // grow animation once per filter/data change
  const animKey = `${period}|${customFrom}|${customTo}|${data ? 'ok' : 'loading'}`;
  useEffect(() => {
    setAnimate(false);
    if (!data) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(raf);
  }, [animKey, data]);

  const GRID_LINES = 4;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold tracking-tight text-gray-900">Tasks by status</h3>
          <p className="mt-0.5 text-[12px] text-gray-500">Task distribution across workflow stages</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-600 focus:border-brand-400 focus:outline-none"
                aria-label="From date"
              />
              <span className="text-[11px] text-gray-400">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-600 focus:border-brand-400 focus:outline-none"
                aria-label="To date"
              />
            </div>
          )}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => pickPeriod(p.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
                  period === p.value ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-800',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isError && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-600">
          <AlertTriangle className="h-3.5 w-3.5" /> Task statistics unavailable — showing last known data.
        </p>
      )}

      {/* Bar chart */}
      <div className="relative mt-5 flex-1">
        {/* horizontal gridlines */}
        <div className="absolute inset-x-0 bottom-8 top-6 flex flex-col justify-between">
          {Array.from({ length: GRID_LINES + 1 }, (_, i) => (
            <div key={i} className="flex items-center">
              <span className="w-8 text-right text-[10px] font-medium tabular-nums text-gray-400">
                {Math.round(axisMax - (axisMax / GRID_LINES) * i)}
              </span>
              <div className="ml-2 h-px flex-1 bg-gray-100" />
            </div>
          ))}
        </div>

        {/* bars */}
        <div className="absolute inset-x-0 bottom-8 top-6 flex items-end justify-around gap-3 pl-10">
          {rows.map((row) => {
            const meta = STATUS_META[row.key];
            const Icon = meta.icon;
            const heightPct = animate ? (row.value / axisMax) * 100 : 0;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => router.push(`/tasks?status=${row.key}`)}
                className="group relative flex h-full w-full max-w-[130px] flex-col items-center justify-end"
                title={`${meta.label}: ${row.value} task${row.value === 1 ? '' : 's'}${row.pct !== null ? ` (${row.pct}%)` : ''}`}
              >
                {/* value label */}
                <span
                  className={cn(
                    'absolute z-10 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums shadow-sm',
                    meta.chip,
                    row.value === 0 && 'opacity-50',
                  )}
                  style={{ bottom: `calc(${heightPct}% + 6px)` }}
                >
                  {isLoading ? '–' : row.value}
                </span>
                {/* bar */}
                <div
                  className={cn(
                    'w-full max-w-[72px] rounded-t-lg bg-gradient-to-b shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[height] duration-700 ease-out group-hover:brightness-105',
                    meta.bar,
                    row.value === 0 && 'opacity-30',
                  )}
                  style={{ height: `${Math.max(heightPct, row.value > 0 ? 2 : 0.5)}%` }}
                />
                {/* baseline handled by gridline */}
              </button>
            );
          })}
        </div>

        {/* x labels */}
        <div className="absolute inset-x-0 bottom-0 flex justify-around gap-3 pl-10">
          {rows.map((row) => {
            const meta = STATUS_META[row.key];
            const Icon = meta.icon;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => router.push(`/tasks?status=${row.key}`)}
                className="flex w-full max-w-[130px] flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition hover:bg-gray-50"
              >
                <Icon className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] font-semibold text-gray-600">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {rows.map((row) => {
          const meta = STATUS_META[row.key];
          const Icon = meta.icon;
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => router.push(`/tasks?status=${row.key}`)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition hover:shadow-sm',
                meta.card,
              )}
            >
              <span className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[11px] font-semibold text-gray-600">{meta.label}</span>
              </span>
              <span className="text-xl font-bold tabular-nums text-gray-900">{isLoading ? '–' : row.value}</span>
              <span className="text-[10px] font-medium text-gray-400">
                {row.pct !== null ? `${row.pct}% of total` : 'No tasks this period'}
              </span>
            </button>
          );
        })}
      </div>

      {total === 0 && !isLoading && !isError && (
        <p className="mt-3 text-center text-[11px] text-gray-400">No tasks recorded for this period — create tasks to see them here.</p>
      )}
    </div>
  );
}
