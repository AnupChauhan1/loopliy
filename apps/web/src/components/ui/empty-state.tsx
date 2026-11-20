'use client';

import { motion } from 'motion/react';
import { LottieAnim } from './lottie';
import type { LottieName } from '@/lib/lottie/animations';
import { cn } from '@/lib/utils';

export function EmptyState({
  animation = 'empty',
  title,
  description,
  action,
  size = 150,
  className,
  compact = false,
}: {
  animation?: LottieName;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-4' : 'py-10', className)}
    >
      <LottieAnim name={animation} size={compact ? Math.min(size, 110) : size} loop={animation !== 'success'} />
      <p className={cn('font-semibold text-gray-800', compact ? 'mt-1 text-sm' : 'mt-3 text-[15px]')}>{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

/** Full-area branded loader (dashboard init / page data). */
export function PageLoader({ label = 'Loading workspace…', className }: { label?: string; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn('flex min-h-[420px] flex-col items-center justify-center', className)}
    >
      <LottieAnim name="loader" size={150} />
      <motion.p
        className="mt-2 text-sm font-medium text-gray-500"
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {label}
      </motion.p>
    </motion.div>
  );
}
