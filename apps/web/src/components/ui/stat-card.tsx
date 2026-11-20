'use client';

import Link from 'next/link';
import { useId } from 'react';
import { motion } from 'motion/react';
import { ArrowUp, Minus } from 'lucide-react';
import { AnimatedNumber } from './animated-number';
import { fadeUp } from './motion';
import { cn } from '@/lib/utils';

export type Tone = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'cyan' | 'fuchsia' | 'slate' | 'orange' | 'pink' | 'blue' | 'red' | 'purple' | 'green';

interface ToneDef {
  /** text colour for the title */
  text: string;
  /** soft icon tile */
  tile: string;
  /** icon colour */
  icon: string;
  hex: string;
  /** card tint (right side wash) */
  wash: string;
}

/** One cohesive green style for every card; red is reserved for genuine overdue/error cards. */
const GREEN: ToneDef = { text: 'text-gray-500', tile: 'bg-brand-50 ring-brand-100', icon: 'text-brand-600', hex: '#00A878', wash: 'rgba(0,168,120,0.06)' };
const DANGER: ToneDef = { text: 'text-gray-500', tile: 'bg-red-50 ring-red-100', icon: 'text-red-600', hex: '#00A878', wash: 'rgba(0,168,120,0.06)' };

export const TONES: Record<Tone, ToneDef> = {
  blue: GREEN, sky: GREEN, purple: GREEN, violet: GREEN, green: GREEN, emerald: GREEN, orange: GREEN,
  amber: GREEN, pink: GREEN, cyan: GREEN, fuchsia: GREEN, slate: GREEN,
  rose: DANGER, red: DANGER,
};

function smoothPath(pts: (readonly [number, number])[]) {
  return pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const cx = (x - px) / 2;
    return `${acc} C${px + cx},${py} ${x - cx},${y} ${x},${y}`;
  }, '');
}

/** Small animated area sparkline (area + self-drawing line + end dot). */
export function Sparkline({ data, color, height = 40, className }: { data: number[]; color: string; height?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const w = 120;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => [i * step, height - 2 - (v / max) * (height - 6)] as const);
  const line = smoothPath(pts);
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn('w-full overflow-visible', className)} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <motion.path d={area} fill={`url(#sp-${id})`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.5 }} />
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

/** Deterministic decorative wave (not data) used as card ornament. */
function decorWave(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: 9 }, (_, i) => {
    const r = ((h >> (i % 16)) & 7) / 7;
    return 2 + i * 0.85 + r * 2.2;
  });
}

export function DeltaChip({ value, title, bad = false }: { value: number | null | undefined; title?: string; bad?: boolean }) {
  if (value === undefined || value === null) return null;
  const up = value > 0;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none',
        !up ? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200/70' : bad ? 'bg-red-50 text-red-600 ring-1 ring-red-100' : 'bg-brand-50 text-brand-600 ring-1 ring-brand-100',
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" strokeWidth={3} /> : <Minus className="h-3 w-3" strokeWidth={3} />}
      {up ? value : ''}
    </span>
  );
}

export function StatCard({
  label,
  sub,
  value,
  icon: Icon,
  cornerIcon: CornerIcon,
  href,
  tone = 'emerald',
  delta,
  deltaTitle = 'New in the last 7 days',
  spark,
  className,
}: {
  label: string;
  sub?: string;
  value: number;
  icon: React.ElementType;
  cornerIcon?: React.ElementType;
  href?: string;
  tone?: Tone;
  delta?: number | null;
  deltaTitle?: string;
  /** real series; when omitted a decorative wave is drawn */
  spark?: number[];
  className?: string;
}) {
  const t = TONES[tone];
  const series = spark && spark.length > 1 ? spark : decorWave(label);
  const body = (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -5 }}
      whileTap={href ? { scale: 0.985 } : undefined}
      transition={{ type: 'spring', stiffness: 350, damping: 24 }}
      className={cn(
        'group relative h-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-card smooth-transition hover:border-brand-200 hover:shadow-card-hover',
        href && 'cursor-pointer',
        className,
      )}
    >
      {/* hover light + accent line */}
      <span className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand-400/20 opacity-0 blur-3xl smooth-transition group-hover:opacity-100" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-brand-500 to-brand-700 smooth-transition group-hover:scale-x-100" />

      {/* decorative corner icon */}
      {CornerIcon && (
        <span className={cn('absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-lg ring-1 smooth-transition group-hover:rotate-6 group-hover:scale-110', t.tile)}>
          <CornerIcon className={cn('h-3.5 w-3.5 opacity-80', t.icon)} />
        </span>
      )}

      {/* decorative sparkline */}
      <div className="pointer-events-none absolute bottom-0 right-0 w-[46%] opacity-70 smooth-transition group-hover:scale-105 group-hover:opacity-100" style={{ transformOrigin: 'bottom right' }}>
        <Sparkline data={series} color={t.hex} height={46} />
      </div>

      <div className="relative flex items-start gap-3.5">
        <motion.span
          className={cn('flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl ring-1', t.tile)}
          whileHover={{ rotate: -10, scale: 1.08 }}
          transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        >
          <Icon className={cn('h-6 w-6', t.icon)} strokeWidth={2.1} />
        </motion.span>
        <div className="min-w-0 pr-8">
          <p className={cn('truncate text-[13px] font-semibold smooth-transition group-hover:text-gray-900', t.text)}>{label}</p>
          <div className="mt-1 flex items-center gap-2">
            <AnimatedNumber value={value} className="text-[28px] font-extrabold leading-none tracking-tight text-gray-900 tabular" />
            <DeltaChip value={delta} title={deltaTitle} bad={t === DANGER} />
          </div>
          {sub && <p className="mt-1.5 truncate text-[11.5px] text-gray-500">{sub}</p>}
        </div>
      </div>
    </motion.div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-2xl focus-premium">
      {body}
    </Link>
  ) : (
    body
  );
}
