'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function usePortalReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClose}
      whileHover={{ rotate: 90, scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 ring-1 ring-gray-200/80 hover:bg-gray-50 hover:text-gray-700"
      aria-label="Close"
    >
      <X className="h-[18px] w-[18px]" />
    </motion.button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ElementType;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ready = usePortalReady();
  useEscape(open, onClose);
  if (!ready) return null;
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-gray-950/50 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              'relative w-full max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] overflow-y-auto rounded-t-3xl border border-white/70 bg-white/95 shadow-[0_40px_100px_-30px_rgba(11,18,32,0.55)] backdrop-blur-2xl sm:max-h-[92vh] sm:rounded-3xl',
              width,
            )}
            initial={{ opacity: 0, y: 40, scale: 0.94, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
            exit={{ opacity: 0, y: 24, scale: 0.96, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 rounded-t-3xl bg-gradient-to-b from-brand-50/80 via-brand-50/30 to-transparent" />
            <div className="relative flex items-start justify-between gap-4 px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
              <div className="flex items-center gap-3">
                {Icon && (
                  <motion.span
                    initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.08 }}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-brand text-white shadow-lg shadow-brand-500/30"
                  >
                    <Icon className="h-5 w-5" />
                  </motion.span>
                )}
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
                  {description && <p className="mt-0.5 text-[13px] text-gray-500">{description}</p>}
                </div>
              </div>
              <CloseButton onClose={onClose} />
            </div>
            <div className="relative px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  children,
  title,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  const ready = usePortalReady();
  useEscape(open, onClose);
  if (!ready) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-gray-950/45 backdrop-blur-sm" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="relative h-dvh w-full max-w-xl overflow-y-auto border-l border-white/60 bg-white/95 shadow-[-30px_0_80px_-30px_rgba(11,18,32,0.45)] backdrop-blur-2xl"
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand-50 via-brand-50/40 to-transparent" />
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100/80 bg-white/70 px-4 py-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 sm:py-5">
              <div className="min-w-0">
                {title && <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>}
                {subtitle && <div className="mt-1.5">{subtitle}</div>}
              </div>
              <CloseButton onClose={onClose} />
            </div>
            <div className="relative p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
