'use client';

import { useMemo, useRef, useState } from 'react';
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

const STAGES: { key: StageKey; label: string; color: string; soft: string; icon: any }[] = [
  { key: 'todo', label: 'To Do', color: '#94a3b8', soft: 'bg-slate-400', icon: CircleDot },
  { key: 'progress', label: 'In Progress', color: '#38bdf8', soft: 'bg-sky-400', icon: Loader },
  { key: 'strategist', label: 'Strategist', color: '#f59e0b', soft: 'bg-amber-400', icon: SearchCheck },
  { key: 'client', label: 'Client Review', color: '#a78bfa', soft: 'bg-violet-400', icon: Send },
  { key: 'done', label: 'Posted / Done', color: '#059669', soft: 'bg-emerald-500', icon: CheckCircle2 },
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

const CARD_CLS = 'rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/60 p-4 sm:p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition-all duration-300 hover:border-emerald-300/70 hover:shadow-[0_12px_36px_rgba(16,185,129,0.10)]';

/** Executive analytics command strip: dual-ring velocity gauge, interactive stage funnel, dual-curve burn-up. */
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

  const stats = useMemo(() => {
    const counts: Record<StageKey, number> = { todo: 0, progress: 0, strategist: 0, client: 0, done: 0 };
    let weighted = 0;
    let overdue = 0;
    let active = 0;
    const days: { date: Date; completed: number; delta: number }[] = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      days.push({ date: d, completed: 0, delta: 0 });
    }
    const dayIndex = (d: Date) => {
      const diff = Math.floor((now.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
      return diff >= 0 && diff <= 13 ? 13 - diff : -1;
    };

    for (const t of tasks) {
      const b = bucket(t);
      counts[b]++;
      weighted += pctOf(t);
      if (isOverdueTask(t)) overdue++;
      if (!DONE.includes(t.status)) active++;
      if (DONE.includes(t.status) && t.completedAt) {
        const di = dayIndex(new Date(t.completedAt));
        if (di >= 0) days[di].completed++;
      }
    }

    // cumulative burn-up: completed units + elapsed fraction of in-flight task progress
    let cum = 0;
    const openUnits = tasks.reduce((s, t) => (!DONE.includes(t.status) ? s + pctOf(t) / 100 : 0), 0);
    const series = days.map((d, i) => {
      cum += d.completed;
      const elapsed = (i + 1) / 14;
      return { date: d.date, value: cum + openUnits * elapsed, delta: d.completed };
    });

    const total = tasks.length;
    const weightedPct = total ? Math.round(weighted / total) : 0;
    const slaPct = total ? Math.round(((total - overdue) / total) * 100) : 100;
    const planned = total ? (i: number) => (total * (i + 1)) / 14 : () => 0;
    return { counts, series, planned, weightedPct, slaPct, overdue, active, done: counts.done, total };
  }, [tasks]);

  const pickStage = (key: StageKey) => {
    if (!onSelectStage) return;
    const next = selected === key ? null : key;
    setSelected(next);
    onSelectStage(next ? STAGE_STATUS[next] : null);
  };

  // ---- Card 1: dual-ring gauge ----
  const outerR = 30, innerR = 21.5;
  const outerC = 2 * Math.PI * outerR, innerC = 2 * Math.PI * innerR;

  // ---- Card 3: dual-curve chart geometry ----
  const W = 300, H = 120, PAD = 6;
  const maxV = Math.max(4, ...stats.series.map((s) => s.value), stats.total);
  const x = (i: number) => PAD + (i / 13) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / maxV) * (H - PAD * 2);
  const pts = stats.series.map((s, i) => `${x(i).toFixed(1)},${y(s.value).toFixed(1)}`);
  const line = pts.join(' ');
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  const planPts = stats.series.map((_, i) => `${x(i).toFixed(1)},${y(stats.planned(i)).toFixed(1)}`).join(' ');
  const dayTicks = [0, 3, 6, 9, 13];

  const onChartMove = (e: React.MouseEvent) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(13, Math.round(((px - PAD) / (W - PAD * 2)) * 13)));
    setHover({ i, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-3', compact && 'gap-3')}>
      {/* Card 1 — Dual-ring velocity & SLA gauge */}
      <div className={CARD_CLS}>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white shadow-sm">
            <Gauge className="h-3 w-3" /> Sprint Velocity
          </span>
          <span className="text-[10px] font-semibold text-slate-400">{stats.total} tasks</span>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="relative h-[104px] w-[104px] shrink-0">
            <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
              <circle cx="36" cy="36" r={innerR} fill="none" stroke="#e2e8f0" strokeWidth="5" />
              <circle cx="36" cy="36" r={outerR} fill="none" stroke="#e2e8f0" strokeWidth="7" />
              <circle cx="36" cy="36" r={innerR} fill="none" stroke="#0ea5e9" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={innerC} strokeDashoffset={innerC * (1 - stats.slaPct / 100)} className="transition-all duration-700" />
              <circle cx="36" cy="36" r={outerR} fill="none" stroke="url(#velGrad)" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={outerC} strokeDashoffset={outerC * (1 - stats.weightedPct / 100)}
                className="transition-all duration-700" style={{ filter: 'drop-shadow(0 0 4px rgba(16,185,129,0.5))' }} />
              <defs>
                <linearGradient id="velGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums text-slate-900">{stats.weightedPct}%</span>
              <span className="text-[8px] font-semibold uppercase text-slate-400">velocity</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between"><span className="text-slate-500">Weighted progress</span><span className="font-bold tabular-nums text-emerald-600">{stats.weightedPct}%</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">On-time SLA</span><span className="font-bold tabular-nums text-sky-600">{stats.slaPct}%</span></div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {[
            { label: 'Active', value: stats.active, cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
            { label: 'Done', value: stats.done, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
            { label: 'Overdue', value: stats.overdue, cls: 'bg-rose-50 text-rose-600 ring-rose-200' },
          ].map((c) => (
            <div key={c.label} className={cn('rounded-xl px-2 py-1.5 text-center ring-1', c.cls)}>
              <p className="text-sm font-bold tabular-nums">{c.value}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wide opacity-80">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Card 2 — Interactive stage funnel */}
      <div className={CARD_CLS}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Stage Distribution</p>
          {selected && onSelectStage && (
            <button type="button" onClick={() => pickStage(selected)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700">
              <X className="h-3 w-3" /> Clear filter
            </button>
          )}
        </div>
        {/* Glass-pill stacked bar */}
        <div className="mt-3 flex h-4 w-full gap-1">
          {STAGES.map((s) => {
            const n = stats.counts[s.key];
            const pct = stats.total ? (n / stats.total) * 100 : 0;
            return pct > 0 ? (
              <div key={s.key} className="h-full rounded-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                style={{ width: `${pct}%`, background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)`, boxShadow: `0 0 8px ${s.color}55` }} title={`${s.label}: ${n}`} />
            ) : null;
          })}
        </div>
        {/* Clickable vertical mini-bars */}
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {STAGES.map((s) => {
            const n = stats.counts[s.key];
            const pct = stats.total ? (n / stats.total) * 100 : 0;
            const active = selected === s.key;
            return (
              <button
                key={s.key}
                type="button"
                disabled={!onSelectStage}
                onClick={() => pickStage(s.key)}
                className={cn(
                  'group flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition-all',
                  onSelectStage && 'cursor-pointer hover:bg-slate-50',
                  active && 'bg-emerald-50 ring-2 ring-emerald-400',
                )}
                title={onSelectStage ? `Filter: ${s.label}` : s.label}
              >
                <div className="flex h-16 w-full items-end justify-center">
                  <div className="w-full max-w-[26px] rounded-t-md transition-all duration-500 group-hover:opacity-80"
                    style={{ height: `${Math.max(6, pct)}%`, background: `linear-gradient(to top, ${s.color}, ${s.color}88)`, minHeight: n ? 6 : 2, opacity: n ? 1 : 0.25 }} />
                </div>
                <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400 group-hover:text-slate-600">{s.label.split(' ')[0]}</span>
                <span className="text-[11px] font-bold tabular-nums text-slate-800">{n}</span>
                <span className="text-[8px] font-semibold text-slate-400">{Math.round(pct)}%</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Card 3 — Dual-curve burn-up chart */}
      <div className={CARD_CLS}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Completion Trend · 14 Days</p>
          <div className="flex items-center gap-2 text-[9px] font-semibold text-slate-400">
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-emerald-600" /> Actual</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-slate-300" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#94a3b8 0 3px,transparent 3px 6px)' }} /> Plan</span>
          </div>
        </div>
        <div ref={chartRef} className="relative mt-2 cursor-crosshair" onMouseMove={onChartMove} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full sm:h-32" preserveAspectRatio="none">
            <defs>
              <linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="#f1f5f9" strokeWidth="1" />
            ))}
            <polygon points={area} fill="url(#burnFill)" />
            <polyline points={planPts} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />
            <polyline points={line} fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 4px rgba(5,150,105,0.35))' }} />
            {stats.series.map((s, i) => s.delta > 0 && (
              <circle key={i} cx={x(i)} cy={y(s.value)} r="2.5" fill="#059669" stroke="#fff" strokeWidth="1" />
            ))}
            {dayTicks.map((i) => (
              <text key={i} x={x(i)} y={H - 1} textAnchor="middle" fontSize="7" fill="#94a3b8" fontWeight="600">
                {i === 0 ? 'D1' : i === 13 ? 'D14' : `D${i + 1}`}
              </text>
            ))}
          </svg>
          {hover && (
            <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[10px] shadow-lg backdrop-blur"
              style={{ left: Math.min(Math.max(hover.x, 60), (chartRef.current?.clientWidth ?? 300) - 60), top: hover.y - 8 }}>
              <p className="font-bold text-slate-800">
                {stats.series[hover.i].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: {stats.series[hover.i].delta} task{stats.series[hover.i].delta === 1 ? '' : 's'}
              </p>
              <p className="text-emerald-600">{Math.round(stats.series[hover.i].value)} units • {Math.round((stats.series[hover.i].value / Math.max(1, stats.total)) * 100)}% velocity</p>
            </div>
          )}
        </div>
        <p className="mt-1 text-[10px] text-slate-400">{stats.series.reduce((s, x) => s + x.delta, 0)} tasks closed this sprint</p>
      </div>
    </div>
  );
}
