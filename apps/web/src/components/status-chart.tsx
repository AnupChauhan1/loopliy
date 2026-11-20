'use client';

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { List, Play, Eye, Check, MoreHorizontal, RefreshCw, ListChecks, Send, AlertTriangle } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { LoadingBar } from '@/components/ui/progress';
import { LottieAnim } from '@/components/ui/lottie';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChartPeriod } from '@/lib/hooks/dashboard';
import { cn } from '@/lib/utils';

export type { ChartPeriod };

const PERIODS: { value: ChartPeriod; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
];
const PERIOD_TEXT: Record<ChartPeriod, string> = { week: 'this week', month: 'this month', year: 'this year' };
const subscribeToVisibility = (callback: () => void) => {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
};
const getVisibility = () => document.visibilityState === 'visible';
const getServerVisibility = () => false;

interface StatusMeta {
  label: string;
  icon: React.ElementType;
  /** gradient stops, top → bottom */
  stops: [string, string, string];
  glow: string;
  /** icon disc fill + icon colour */
  disc: string;
  iconColor: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  // Four shades of brand green: lightest = not started, deepest = done
  todo: { label: 'To Do', icon: List, stops: ['#57CDA7', '#93E0C6', '#C6EFE0'], glow: '#57CDA7', disc: '#E8F8F2', iconColor: '#007F5F' },
  in_progress: { label: 'In Progress', icon: Play, stops: ['#22BA8C', '#00A878', '#00936A'], glow: '#00A878', disc: '#00A878', iconColor: '#ffffff' },
  in_review: { label: 'In Review', icon: Eye, stops: ['#00936A', '#007F5F', '#00654C'], glow: '#007F5F', disc: '#007F5F', iconColor: '#ffffff' },
  completed: { label: 'Completed', icon: Check, stops: ['#00654C', '#004D3A', '#003A2C'], glow: '#004D3A', disc: '#004D3A', iconColor: '#ffffff' },
};
const KEYS = ['todo', 'in_progress', 'in_review', 'completed'] as const;

interface Datum {
  key: string;
  name: string;
  value: number;
  pct: number;
}

/** Y axis with 5 even steps from a 1/2/5 ladder, ~12% headroom for value badges (8 → 0..10). */
function niceAxis(max: number) {
  const target = Math.max(max * 1.12, 1);
  const ladder = [1, 2, 5];
  let step = 1;
  for (let mag = 1; ; mag *= 10) {
    const found = ladder.map((l) => l * mag).find((s) => s * 5 >= target);
    if (found) { step = found; break; }
  }
  if (max === 0) step = 2;
  return { max: step * 5, ticks: Array.from({ length: 6 }, (_, i) => i * step) };
}

/** Rounded-top, square-bottom bar outline (same command structure for any height so it can tween). */
function barPath(x: number, base: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  const top = base - h;
  return `M${x},${base} L${x},${top + rr} Q${x},${top} ${x + rr},${top} L${x + w - rr},${top} Q${x + w},${top} ${x + w},${top + rr} L${x + w},${base} Z`;
}

/*
 * Shared state for the shapes Recharts renders. Using context (instead of inline
 * render functions) keeps their identity stable, so hovering never remounts the
 * bars and restarts their grow animation.
 */
const ActiveCtx = createContext<number | null>(null);
const RowsCtx = createContext<Datum[]>([]);
const HeightMemoCtx = createContext<Map<string, number>>(new Map());
const NavCtx = createContext<(key: string) => void>(() => {});
const IdCtx = createContext('sc');
const SweepCtx = createContext(false);

/* ---------------- Bar: gradient body, gloss, sweep, glow, badge, status disc ---------------- */
function GlowBar(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const activeIndex = useContext(ActiveCtx);
  const rows = useContext(RowsCtx);
  const memo = useContext(HeightMemoCtx);
  const go = useContext(NavCtx);
  const uid = useContext(IdCtx);
  const sweepActive = useContext(SweepCtx);
  const key: string = payload?.key;
  const meta = STATUS_META[key];
  const index = Math.max(0, rows.findIndex((r) => r.key === key));
  const base = y + height;
  const h = Math.max(height, 0);
  const seen = memo.has(key);
  const prevH = memo.get(key) ?? 0;
  useEffect(() => {
    if (key) memo.set(key, h);
  }, [memo, key, h]);
  if (!meta || width <= 0) return <g />;

  const active = activeIndex === index;
  const dim = activeIndex !== null && !active;
  const delay = seen ? 0 : 0.06 + index * 0.05;
  const grow = { type: 'spring' as const, stiffness: 110, damping: 18, mass: 1, delay };
  const cx = x + width / 2;
  const d0 = barPath(x, base, width, prevH, 10);
  const d1 = barPath(x, base, width, h, 10);
  const Icon = meta.icon;
  const badgeW = Math.max(26, String(payload.value).length * 8 + 16);
  // keep the badge clear of the status disc when a bar is very short
  const badgeY = (bh: number) => Math.min(base - bh - 18, base - 34);

  return (
    <g>
      <defs>
        <clipPath id={`${uid}-clip-${key}`}>
          <motion.path initial={{ d: d0 }} animate={{ d: d1 }} transition={grow} />
        </clipPath>
      </defs>

      {/* bar (lifts + brightens on hover) */}
      <motion.g
        animate={{ y: active ? -5 : 0, opacity: dim ? 0.62 : 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        style={{ filter: active ? `url(#${uid}-glow-strong-${key}) brightness(1.08)` : `url(#${uid}-glow-${key})` }}
      >
        <motion.path initial={{ d: d0 }} animate={{ d: d1 }} transition={grow} fill={`url(#${uid}-grad-${key})`} />
        <g clipPath={`url(#${uid}-clip-${key})`}>
          {/* left gloss */}
          <rect x={x} y={base - h} width={width * 0.42} height={h} fill={`url(#${uid}-gloss)`} />
          {/* top highlight */}
          <rect x={x} y={base - h} width={width} height={Math.min(18, h)} fill={`url(#${uid}-tophl)`} />
          {/* travelling light sweep */}
          {h > 0 && (
            <motion.rect
              x={x}
              width={width}
              height={46}
              fill={`url(#${uid}-sweep)`}
              initial={{ y: base - h - 50 }}
              animate={sweepActive ? { y: [base - h - 50, base + 4] } : { y: base - h - 50 }}
              transition={sweepActive
                ? { duration: 2.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 3.5, delay: 1.4 + index * 0.35 }
                : { duration: 0 }}
            />
          )}
        </g>
      </motion.g>

      {/* value badge with pointer */}
      <motion.g
        initial={{ opacity: seen ? 1 : 0, scale: seen ? 1 : 0.5, x: cx, y: badgeY(prevH) }}
        animate={{ opacity: 1, scale: active ? 1.15 : 1, x: cx, y: badgeY(h) - (active ? 5 : 0) }}
        transition={{ type: 'spring', stiffness: 220, damping: 18, delay: seen ? 0 : delay + 0.45 }}
      >
        <rect x={-badgeW / 2} y={-11} width={badgeW} height={20} rx={6} fill="#111827" />
        <rect x={-badgeW / 2 + 5} y={-11} width={badgeW - 10} height={2} rx={1} fill="#22BA8C" />
        <path d="M-5,9 L0,14 L5,9 Z" fill="#111827" />
        <text x={0} y={3.5} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#fff" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {payload.value}
        </text>
      </motion.g>

      {/* status disc on the baseline */}
      <motion.g
        initial={{ opacity: 0, scale: 0.3, x: cx, y: base }}
        animate={{ opacity: 1, scale: 1, x: cx, y: base }}
        whileHover={{ scale: 1.16 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 400, damping: 16, delay: seen ? 0 : 0.1 + index * 0.12 }}
        style={{ cursor: 'pointer' }}
        onClick={() => go(key)}
        role="link"
        aria-label={`View ${meta.label} tasks`}
      >
        {active && sweepActive && (
          <motion.circle r={19} fill="none" stroke={meta.glow} strokeWidth={2} initial={{ opacity: 0.8, scale: 1 }} animate={{ opacity: 0, scale: 1.7 }} transition={{ duration: 1.1, repeat: Infinity }} />
        )}
        <circle r={18} fill="#ffffff" filter={`url(#${uid}-disc-shadow)`} />
        <circle r={13.5} fill={meta.disc} />
        <Icon x={-7} y={-7} width={14} height={14} color={meta.iconColor} strokeWidth={2.6} fill={key === 'in_progress' ? meta.iconColor : 'none'} />
      </motion.g>
    </g>
  );
}

/* ---------------- X axis label ---------------- */
function AxisLabel(props: any) {
  const { x = 0, y = 0, payload, index } = props;
  const activeIndex = useContext(ActiveCtx);
  const meta = STATUS_META[payload?.value];
  if (!meta) return null;
  const active = activeIndex === index;
  return (
    <motion.text
      x={x}
      y={y + 30}
      textAnchor="middle"
      fontSize={12.5}
      fontWeight={active ? 800 : 600}
      fill={active ? '#111827' : '#374151'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 + (index ?? 0) * 0.1 }}
    >
      {meta.label}
    </motion.text>
  );
}

/* ---------------- Tooltip ---------------- */
function ChartTooltip({ active, payload, total, periodText }: any) {
  const d: Datum | undefined = payload?.[0]?.payload;
  const meta = d ? STATUS_META[d.key] : undefined;
  if (!active || !d || !meta) return null;
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className="relative min-w-[168px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]/95 p-3 text-white shadow-[0_24px_50px_-12px_rgba(11,18,32,0.6)] backdrop-blur-xl sm:min-w-[200px] sm:p-3.5"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl" style={{ background: `${meta.glow}66` }} />
      <div className="relative flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `linear-gradient(135deg, ${meta.stops[0]}, ${meta.stops[2]})`, boxShadow: `0 6px 16px -4px ${meta.glow}` }}>
          <Icon className="h-4 w-4 text-white" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</p>
          <p className="text-sm font-bold leading-tight">{meta.label}</p>
        </div>
      </div>
      <div className="relative mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/[0.06] px-2.5 py-2 ring-1 ring-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tasks</p>
          <p className="text-lg font-extrabold leading-tight tabular">{d.value}</p>
        </div>
        <div className="rounded-xl bg-white/[0.06] px-2.5 py-2 ring-1 ring-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Share</p>
          <p className="text-lg font-extrabold leading-tight tabular text-brand-300">{d.pct}%</p>
        </div>
      </div>
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${meta.stops[0]}, ${meta.stops[2]})`, boxShadow: `0 0 10px ${meta.glow}` }}
          initial={{ width: 0 }}
          animate={{ width: `${d.pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <p className="relative mt-2 hidden text-[11px] text-gray-400 sm:block">{d.value} of {total} tasks active {periodText}</p>
    </motion.div>
  );
}

function CursorColumn(props: any) {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  return <rect x={x + 4} y={y} width={Math.max(width - 8, 0)} height={height} rx={14} fill="rgba(156,163,175,0.08)" />;
}

/* ---------------- Period filter with sliding indicator ---------------- */
function PeriodFilter({ value, onChange }: { value: ChartPeriod; onChange: (p: ChartPeriod) => void }) {
  return (
    <div role="tablist" aria-label="Time period" className="flex items-center gap-1.5">
      {PERIODS.map((p) => {
        const active = p.value === value;
        return (
          <motion.button
            key={p.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(p.value)}
            whileTap={{ scale: 0.94 }}
            className={cn(
              'relative isolate whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors duration-300 focus-premium',
              active ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700',
            )}
          >
            {active && (
              <motion.span
                layoutId="status-period-pill"
                className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 shadow-[0_6px_16px_-6px_rgba(0,168,120,0.8),inset_0_1px_0_rgba(255,255,255,0.25)]"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            {p.label}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ---------------- Main component ---------------- */
interface StatusChartProps {
  byStatus: Record<string, number> | undefined;
  period: ChartPeriod;
  onPeriodChange: (p: ChartPeriod) => void;
  onRefresh?: () => void;
  loading?: boolean;
  fetching?: boolean;
  error?: boolean;
}

export function StatusChart({ byStatus, period, onPeriodChange, onRefresh, loading, fetching, error }: StatusChartProps) {
  const router = useRouter();
  const uid = `sc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [heights] = useState(() => new Map<string, number>());
  // Bars fill ~58% of their category (matches the reference proportions at any width)
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(640);
  const chartInView = useInView(plotRef);
  const documentVisible = useSyncExternalStore(subscribeToVisibility, getVisibility, getServerVisibility);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPlotWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);
  const barSize = Math.max(28, Math.min(120, Math.round(((plotWidth - 36) / KEYS.length) * 0.58)));

  const data: Datum[] = useMemo(() => {
    const total = KEYS.reduce((s, k) => s + (byStatus?.[k] ?? 0), 0);
    return KEYS.map((k) => {
      const value = byStatus?.[k] ?? 0;
      return { key: k, name: k, value, pct: total ? Math.round((value / total) * 100) : 0 };
    });
  }, [byStatus]);
  const total = data.reduce((s, d) => s + d.value, 0);
  const axis = niceAxis(Math.max(...data.map((d) => d.value), 0));
  const showEmpty = !loading && !error && total === 0;
  const sweepActive = chartInView && documentVisible;
  const goToStatus = (key: string) => router.push(`/tasks?status=${key}`);

  return (
    <SweepCtx.Provider value={sweepActive}>
      <NavCtx.Provider value={goToStatus}>
        <IdCtx.Provider value={uid}>
          <HeightMemoCtx.Provider value={heights}>
            <ActiveCtx.Provider value={activeIndex}>
              <RowsCtx.Provider value={data}>
              <div className="relative flex h-full flex-col">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 md:flex-nowrap">
                  <div className="min-w-0">
                    <h3 className="text-[19px] font-bold tracking-tight text-gray-900">Tasks by status</h3>
                    <p className="mt-0.5 truncate text-[12.5px] text-gray-500">Overview of all tasks across different stages</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PeriodFilter value={period} onChange={onPeriodChange} />
                    <DropdownMenu
                      trigger={
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.06 }}
                          whileTap={{ scale: 0.92 }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-900"
                          aria-label="Chart options"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </motion.button>
                      }
                    >
                      <DropdownMenuItem onClick={() => router.push('/tasks')}><ListChecks className="mr-2 h-4 w-4" /> View all tasks</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push('/tasks?status=in_review')}><Send className="mr-2 h-4 w-4" /> Review queue</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push('/tasks?overdue=true')}><AlertTriangle className="mr-2 h-4 w-4" /> Overdue tasks</DropdownMenuItem>
                      {onRefresh && <DropdownMenuItem onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" /> Refresh data</DropdownMenuItem>}
                    </DropdownMenu>
                  </div>
                </div>
                <LoadingBar active={!!fetching && !loading} className="mt-2" />

                {/* Chart */}
                <div ref={plotRef} className="relative mt-1 min-h-[280px] w-full flex-1">
                  {!loading && !error && (
                    <motion.p
                      key={period}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pointer-events-none absolute right-2 top-1 z-10 text-[11px] font-medium text-gray-400"
                    >
                      <span className="font-bold text-gray-600 tabular">{total}</span> tasks active {PERIOD_TEXT[period]}
                    </motion.p>
                  )}
                  {loading ? (
                    <div className="absolute inset-0 flex items-end justify-around gap-6 pb-14 pl-12 pr-4 pt-10">
                      {[70, 60, 60, 50].map((hh, i) => (
                        <Skeleton key={i} className="w-full max-w-[96px] rounded-t-xl rounded-b-none" style={{ height: `${hh}%` }} />
                      ))}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <LottieAnim name="loader" size={110} />
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minHeight={280} initialDimension={{ width: 640, height: 280 }}>
                      <BarChart
                        data={data}
                        margin={{ top: 30, right: 8, left: -6, bottom: 4 }}
                        barSize={barSize}
                        onMouseMove={(s: any) => {
                          const idx = s?.activeTooltipIndex;
                          setActiveIndex(idx === undefined || idx === null || idx === '' ? null : Number(idx));
                        }}
                        onMouseLeave={() => setActiveIndex(null)}
                      >
                        <defs>
                          {KEYS.map((k) => {
                            const m = STATUS_META[k];
                            return (
                              <linearGradient key={k} id={`${uid}-grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={m.stops[0]} />
                                <stop offset="55%" stopColor={m.stops[1]} />
                                <stop offset="100%" stopColor={m.stops[2]} />
                              </linearGradient>
                            );
                          })}
                          {KEYS.map((k) => (
                            <filter key={`g${k}`} id={`${uid}-glow-${k}`} x="-40%" y="-20%" width="180%" height="150%">
                              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor={STATUS_META[k].glow} floodOpacity="0.32" />
                            </filter>
                          ))}
                          {KEYS.map((k) => (
                            <filter key={`s${k}`} id={`${uid}-glow-strong-${k}`} x="-40%" y="-20%" width="180%" height="150%">
                              <feDropShadow dx="0" dy="12" stdDeviation="12" floodColor={STATUS_META[k].glow} floodOpacity="0.55" />
                            </filter>
                          ))}
                          <linearGradient id={`${uid}-gloss`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id={`${uid}-tophl`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity={0} />
                            <stop offset="50%" stopColor="#ffffff" stopOpacity={0.32} />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                          </linearGradient>
                          <filter id={`${uid}-disc-shadow`} x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#111827" floodOpacity="0.18" />
                          </filter>
                        </defs>

                        <CartesianGrid vertical={false} stroke="#EEF0F3" />
                        <XAxis dataKey="name" interval={0} height={46} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} tick={<AxisLabel />} />
                        <YAxis
                          width={34}
                          allowDecimals={false}
                          domain={[0, axis.max]}
                          ticks={axis.ticks}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11.5, fill: '#6B7280', fontWeight: 600 }}
                          tickMargin={6}
                        />
                        <Tooltip
                          cursor={<CursorColumn />}
                          content={<ChartTooltip total={total} periodText={PERIOD_TEXT[period]} />}
                          wrapperStyle={{ outline: 'none', zIndex: 20 }}
                          allowEscapeViewBox={{ x: false, y: true }}
                          offset={18}
                        />
                        <Bar dataKey="value" isAnimationActive={false} shape={<GlowBar />} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  <AnimatePresence>
                    {showEmpty && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center"
                      >
                        <LottieAnim name="empty" size={110} />
                        <p className="text-sm font-semibold text-gray-700">No task activity {PERIOD_TEXT[period]}</p>
                        <p className="text-xs text-gray-500">Try a wider time range.</p>
                      </motion.div>
                    )}
                    {error && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
                        <AlertTriangle className="h-6 w-6 text-rose-400" />
                        <p className="text-sm font-semibold text-gray-700">Couldn&apos;t load task statistics</p>
                        <p className="text-xs text-gray-500">The dashboard API did not respond. It will retry automatically.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              </RowsCtx.Provider>
            </ActiveCtx.Provider>
          </HeightMemoCtx.Provider>
        </IdCtx.Provider>
      </NavCtx.Provider>
    </SweepCtx.Provider>
  );
}
