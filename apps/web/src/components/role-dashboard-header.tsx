'use client';

import { motion } from 'motion/react';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/** Signature dashboard header: greeting + dual-tone gradient title + date card. */
export function RoleDashboardHeader({
  roleLabel,
  title,
  subtitle,
}: {
  roleLabel: string;
  title?: string;
  subtitle?: string;
}) {
  const { user } = useAuth();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateStr = `${now.toLocaleDateString('en-US', { weekday: 'long' })}, ${now.getDate()} ${now.toLocaleDateString('en-US', { month: 'short' })} ${now.getFullYear()}`;

  return (
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <motion.p
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="text-[14px] font-semibold text-gray-700"
        >
          {greeting}, {user?.firstName ?? 'there'}!{' '}
          <motion.span
            className="inline-block origin-[70%_70%]"
            animate={{ rotate: [0, 16, -8, 14, -4, 10, 0] }}
            transition={{ duration: 1.8, delay: 0.6, ease: 'easeInOut' }}
          >
            👋
          </motion.span>
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
          transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="mt-0.5 text-[32px] font-extrabold leading-tight tracking-tight text-gray-900 sm:text-[36px]"
        >
          {roleLabel}{' '}
          <span className="bg-[linear-gradient(110deg,#007F5F_0%,#00A878_35%,#22BA8C_55%,#00A878_75%,#007F5F_100%)] bg-[length:220%_100%] bg-clip-text text-transparent [animation:gradientShift_6s_ease-in-out_infinite]">
            {title ?? 'Dashboard'}
          </span>
        </motion.h1>
        {subtitle && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-1 text-[13.5px] text-gray-500">
            {subtitle}
          </motion.p>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-2.5 shadow-[0_6px_20px_-12px_rgba(17,24,39,0.25)] backdrop-blur"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <CalendarDays className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-[13px] font-bold leading-tight text-gray-900">{dateStr}</p>
          <p className="text-[11px] text-gray-500">Have a productive day!</p>
        </div>
      </motion.div>
    </div>
  );
}
