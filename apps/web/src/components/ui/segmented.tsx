'use client';

import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ElementType;
  count?: number;
}

/** Pill tabs with a spring-animated sliding indicator. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  dark = false,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  dark?: boolean;
}) {
  const layoutId = useId();
  return (
    <div
      role="tablist"
      className={cn(
        'relative inline-flex items-center gap-0.5 rounded-full p-1',
        dark ? 'bg-white/[0.06] ring-1 ring-white/10' : 'bg-gray-100/90 ring-1 ring-gray-200/70 shadow-inner',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-10 flex items-center gap-1.5 rounded-full font-semibold transition-colors duration-300 focus-premium',
              size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs',
              active ? 'text-white' : dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-full gradient-brand shadow-[0_6px_16px_-6px_rgba(0,168,120,0.75)]"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {o.label}
            {o.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-[10px] leading-4', active ? 'bg-white/25' : 'bg-white text-gray-500 ring-1 ring-gray-200')}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
