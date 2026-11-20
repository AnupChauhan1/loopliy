'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/** Animated progress bar that grows from 0 with a glowing leading edge. */
export function ProgressBar({
  value,
  color,
  className,
  height = 6,
  delay = 0,
}: {
  value: number;
  color?: string;
  className?: string;
  height?: number;
  delay?: number;
}) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const fill = color ? `linear-gradient(90deg, ${color}99, ${color})` : 'linear-gradient(90deg, #00936A, #00A878 50%, #007F5F)';
  return (
    <div className={cn('relative w-full overflow-hidden rounded-full bg-gray-200/60', className)} style={{ height }}>
      <motion.div
        className="relative h-full rounded-full"
        style={{ background: fill, boxShadow: `0 0 12px ${color ?? '#00A878'}88` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {pct > 4 && <span className="absolute inset-y-0 right-0 w-3 rounded-full bg-white/60 blur-[3px]" />}
      </motion.div>
    </div>
  );
}

/** Circular progress ring. */
export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  children,
  gradientId = 'ring-grad',
  track = 'rgba(156,163,175,0.18)',
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  gradientId?: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22BA8C" />
            <stop offset="50%" stopColor="#007F5F" />
            <stop offset="100%" stopColor="#007F5F" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 1.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: 'drop-shadow(0 0 6px rgba(34,186,140,0.6))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Thin indeterminate bar for background refetches. */
export function LoadingBar({ active, className }: { active: boolean; className?: string }) {
  return (
    <div className={cn('relative h-0.5 w-full overflow-hidden rounded-full transition-opacity duration-300', active ? 'opacity-100' : 'opacity-0', className)}>
      <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-brand-400 to-transparent animate-progress-indeterminate" />
    </div>
  );
}
