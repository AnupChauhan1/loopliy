'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export function PageHeader({
  eyebrow,
  title,
  highlight,
  description,
  actions,
  icon: Icon,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  highlight?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ElementType;
  className?: string;
}) {
  const ease = [0.16, 1, 0.3, 1] as const;
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex items-start gap-4 min-w-0">
        {Icon && (
          <motion.span
            initial={{ scale: 0.5, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 16 }}
            whileHover={{ rotate: -8, scale: 1.06 }}
            className="relative hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl gradient-brand text-white shadow-[0_12px_30px_-10px_rgba(0,168,120,0.7)]"
          >
            <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/30" />
            <Icon className="h-[22px] w-[22px]" />
          </motion.span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <motion.p
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease }}
              className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600"
            >
              <span className="h-px w-5 bg-gradient-to-r from-brand-500 to-transparent" />
              {eyebrow}
            </motion.p>
          )}
          <motion.h1
            initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, ease, delay: 0.05 }}
            className="text-[28px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[32px]"
          >
            {title} {highlight && <span className="gradient-text-animated">{highlight}</span>}
          </motion.h1>
          {description && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease, delay: 0.12 }}
              className="mt-1.5 max-w-2xl text-sm text-gray-500"
            >
              {description}
            </motion.p>
          )}
        </div>
      </div>
      {actions && (
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease, delay: 0.15 }}
          className="flex flex-wrap items-center gap-2"
        >
          {actions}
        </motion.div>
      )}
    </div>
  );
}
