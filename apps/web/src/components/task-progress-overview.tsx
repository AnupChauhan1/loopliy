'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleDot, Gauge, Loader, SearchCheck, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DONE = ['completed', 'approved'];

function pctOf(t: any): number {
  if (typeof t.progress === 'number') return Math.max(0, Math.min(100, t.progress));
  return DONE.includes(t.status) ? 100 : ['in_review', 'client_review'].includes(t.status) ? 80 : t.status === 'in_progress' ? 50 : 0;
}

function isOverdueTask(t: any): boolean {
  if (t.isOverdue) return true;
  if (!t.deadline || DONE.includes(t.status)) return false;
  return new Date(t.deadline).getTime() < Date.now();
}

type StageKey = 'todo' | 'progress' | 'strategist' | 'client' | 'done';

const STAGES: { key: StageKey; label: string; color: string; icon: any }[] = [
  { key: 'todo', label: 'To Do', color: '#64748b', icon: CircleDot },
  { key: 'progress', label: 'In Progress', color: '#0ea5e9', icon: Loader },
  { key: 'strategist', label: 'Strategist Review', color: '#f59e0b', icon: SearchCheck },
  { key: 'client', label: 'Client Review', color: '#8b5cf6', icon: Send },
  { key: 'done', label: 'Posted / Done', color: '#059669', icon: CheckCircle2 },
];

const STAGE_STATUS: Record<StageKey, string> = {
  todo: 'todo', progress: 'in_progress', strategist: 'in_review', client: 'client_review', done: 'completed',
};

function bucket(t: any): StageKey {
  if (DONE.includes(t.status) || (t.creativeStage ?? 0) >= 4) return 'done';
  if (t.status === 'client_review' || (t.creativeStage ?? 0) === 3) return 'client';
  if (t.status === 'in_review' || (t.creativeStage ?? 0) === 2) return 'strategist';
  if (['in_progress', 'changes_requested'].includes(t.status) || (t.creativeStage ?? 0) === 1) return 'progress';
  return 'todo';
}

const WHITE_CARD = 'flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition-all duration-300 hover:border-emerald-300/70 hover:shadow-[0_12px_36px_rgba(16,185,129,0.10)] sm:p-6';

/** Executive Bento command deck: dark velocity hero, interactive pipeline rows, dual-curve pace chart. */
export function TaskProgressOverview({
  tasks,
  compact = false,
  onSelectStage,
}: {
  tasks: any[];
  compact?: boolean;
  onSelectStage?: (status: string | null) => void;
}) {
  const [selected, setSelected] = useState<StageKey | null>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const stats = useMemo(() => {
    const counts: Record<StageKey, number> = { todo: 0, progress: 0, strategist: 0, client: 0, done: 0 };
    let weighted = 0;
    let overdue = 0;
    let active = 0;
    let closedSprint = 0;
    let dueWeek = 0;
    const weekAhead = Date.now() + 7 * 86400000;

    const days: { date: Date; completed: number }[] = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      days.push({ date: d, completed: 0 });
    }
    const dayIndex = (d: Date) => {
      const t = new Date(d).setHours(0, 0, 0, 0);
      const diff = Math.floor((now.getTime() - t) / 86400000);
      return diff >= 0 && diff <= 13 ? 13 - diff : -1;
    };

    for (const t of tasks) {
      counts[bucket(t)]++;
      weighted += pctOf(t);
      if (isOverdueTask(t)) overdue++;
      if (!DONE.includes(t.status)) {
        active++;
        if (t.deadline) {
          const dl = new Date(t.deadline).getTime();
          if (dl >= Date.now() && dl <= weekAhead) dueWeek++;
        }
      }
      if (DONE.includes(t.status)) {
        closedSprint++;
        if (t.completedAt) {
          const di = dayIndex(new Date(t.completedAt));
          if (di >= 0) days[di].completed++;
        }
      }
    }

    let cum = 0;
    const openUnits = tasks.reduce((s, t) => (!DONE.includes(t.status) ? s + pctOf(t) / 100 : 0), 0);
    const series = days.map((d, i) => {
      cum += d.completed;
      return { date: d.date, value: cum + openUnits * ((i + 1) / 14), delta: d.completed };
    });

    const total = tasks.length;
    return {
      counts, series,
      weightedPct: total ? Math.round(weighted / total) : 0,
      slaPct: total ? Math.round(((total - overdue) / total) * 100) : 100,
      overdue, active, done: counts.done, total, closedSprint, dueWeek,
      planned: (i: number) => (total * (i + 1)) / 14,
    };
  }, [tasks]);

  const pickStage = (key: StageKey) => {
    if (!onSelectStage) return;
    const next = selected === key ? null : key;
    setSelected(next);
    onSelectStage(next ? STAGE_STATUS[next] : null);
  };

  // Chart geometry — bottom 30px reserved purely for day labels
  const W = 360, H = 150, PAD = 10, LABEL_H = 30;
  const plotH = H - PAD - LABEL_H;
  const maxV = Math.max(4, ...stats.series.map((s) => s.value), stats.total);
  const x = (i: number) => PAD + (i / 13) * (W - PAD * 2);
  const y = (v: number) => PAD + plotH - (v / maxV) * plotH;
  const pts = stats.series.map((s, i) => `${x(i).toFixed(1)},${y(s.value).toFixed(1)}`);
  const line = pts.join(' ');
  const area = `${PAD},${PAD + plotH} ${line} ${W - PAD},${PAD + plotH}`;
  const planPts = stats.series.map((_, i) => `${x(i).toFixed(1)},${y(stats.planned(i)).toFixed(1)}`).join(' ');
  const dayTicks = [
    { i: 0, label: 'Day 1' }, { i: 4, label: 'Day 5' }, { i: 9, label: 'Day 10' }, { i: 13, label: 'Day 14' },
  ];

  const onChartMove = (e: React.MouseEvent) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(13, Math.round(((px - PAD) / (W - PAD * 2)) * 13)));
    setHover({ i, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const ringR = 34;
  const ringC = 2 * Math.PI * ringR;

  return (
    <div
      className={cn('block w-full min-w-0', compact ? 'gap-4' : 'gap-5')}
      style={{
        display: 'grid',
        gridTemplateColumns: isDesktop ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)',
        gap: compact ? '16px' : '20px',
        width: '100%',
      }}
    >
      {/* Card 1 — Dark obsidian/emerald hero velocity card */}
      <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-[#061412] via-[#08241E] to-[#0B1726] p-5 text-white shadow-xl sm:p-6" style={{ width: '100%', minWidth: 0 }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300 backdrop-blur">
            <Gauge className="h-3 w-3" /> Sprint Velocity
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-100/90 ring-1 ring-white/10">{stats.total} Total Tasks</span>
        </div>

        <div className="relative mt-5 flex items-center gap-5">
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
              <circle cx="42" cy="42" r={ringR} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
              <circle cx="42" cy="42" r={ringR} fill="none" stroke="url(#heroRing)" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={ringC} strokeDashoffset={ringC * (1 - stats.weightedPct / 100)}
                className="transition-all duration-700" style={{ filter: 'drop-shadow(0 0 6px rgba(16,185,129,0.7))' }} />
              <defs>
                <linearGradient id="heroRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold tabular-nums">{stats.weightedPct}%</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight tabular-nums sm:text-xl">{stats.done} <span className="text-sm font-medium text-emerald-200/70">of {stats.total}</span></p>
            <p className="text-[11px] font-medium text-emerald-100/70">Completed</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-bold text-sky-300 ring-1 ring-sky-400/30">
              On-Time SLA <span className="tabular-nums">{stats.slaPct}%</span>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {[
            { label: 'Active', value: stats.active, danger: false },
            { label: 'Done', value: stats.done, danger: false },
            { label: 'Overdue', value: stats.overdue, danger: stats.overdue > 0 },
          ].map((c) => (
            <div key={c.label} className={cn(
              'rounded-xl border px-2 py-2 text-center backdrop-blur transition',
              c.danger ? 'border-rose-400/30 bg-rose-400/10' : 'border-white/10 bg-white/10',
            )}>
              <p className={cn('text-base font-bold tabular-nums', c.danger && 'text-rose-300')}>{c.value}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-100/60">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Card 2 — Horizontal pipeline breakdown */}
      <div className={WHITE_CARD} style={{ width: '100%', minWidth: 0 }}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Stage Distribution</p>
          {selected && onSelectStage ? (
            <button type="button" onClick={() => pickStage(selected)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm transition hover:bg-emerald-700">
              <X className="h-3 w-3" /> Reset
            </button>
          ) : onSelectStage ? (
            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-300">Click to filter</span>
          ) : null}
        </div>
        <div className="mt-4 space-y-3.5">
          {STAGES.map((s) => {
            const n = stats.counts[s.key];
            const pct = stats.total ? Math.round((n / stats.total) * 100) : 0;
            const active = selected === s.key;
            return (
              <button
                key={s.key}
                type="button"
                disabled={!onSelectStage}
                onClick={() => pickStage(s.key)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all duration-200',
                  onSelectStage && 'cursor-pointer hover:border-slate-300 hover:bg-slate-50/80',
                  active ? 'border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-300' : 'border-transparent',
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}66` }} />
                <span className="min-w-0 shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-600">{s.label}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(n ? 4 : 0, pct)}%`, background: `linear-gradient(90deg, ${s.color}bb, ${s.color})` }} />
                </div>
                <span className="w-6 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-800">{n}</span>
                <span className="w-9 shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-center text-[9px] font-bold tabular-nums text-slate-500">{pct}%</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Card 3 — 14-day delivery pace chart */}
      <div className={WHITE_CARD} style={{ width: '100%', minWidth: 0 }}>
        <div className="flex items-center justify-between gap-2">
          <p className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">14-Day Delivery Pace</p>
          <div className="flex shrink-0 items-center gap-2.5 text-[9px] font-semibold text-slate-400">
            <span className="flex items-center gap-1 whitespace-nowrap"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Actual</span>
            <span className="flex items-center gap-1 whitespace-nowrap"><span className="h-0.5 w-3 rounded bg-slate-300" /> Target</span>
          </div>
        </div>
        <div ref={chartRef} className="relative mt-1 cursor-crosshair" onMouseMove={onChartMove} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-36 w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.33, 0.66].map((f) => (
              <line key={f} x1={PAD} x2={W - PAD} y1={PAD + plotH * f} y2={PAD + plotH * f} stroke="#f1f5f9" strokeWidth="1" />
            ))}
            <polygon points={area} fill="url(#paceFill)" />
            <polyline points={planPts} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />
            <polyline points={line} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 4px rgba(5,150,105,0.35))' }} />
            {stats.series.map((s, i) => s.delta > 0 && (
              <circle key={i} cx={x(i)} cy={y(s.value)} r="2.5" fill="#059669" stroke="#fff" strokeWidth="1" />
            ))}
          </svg>
          {/* X-axis labels live OUTSIDE the plot area — zero overlap guaranteed */}
          <div className="mt-2 flex justify-between px-1 text-[11px] font-medium text-slate-400">
            {dayTicks.map(({ label }) => <span key={label}>{label}</span>)}
          </div>
          {hover && (
            <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[10px] shadow-lg backdrop-blur"
              style={{ left: `${Math.min(Math.max((hover.x / (chartRef.current?.clientWidth ?? 300)) * 100, 12), 88)}%`, top: `${(hover.y / (chartRef.current?.clientHeight ?? 160)) * 100}%` }}>
              <p className="font-bold text-slate-800">
                {stats.series[hover.i].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: {stats.series[hover.i].delta} task{stats.series[hover.i].delta === 1 ? '' : 's'}
              </p>
              <p className="text-emerald-600">{Math.round(stats.series[hover.i].value)} units • {Math.round((stats.series[hover.i].value / Math.max(1, stats.total)) * 100)}% velocity</p>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>{stats.closedSprint} completed</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">{stats.dueWeek} due in next 7 days</span>
        </div>
      </div>
    </div>
  );
}
