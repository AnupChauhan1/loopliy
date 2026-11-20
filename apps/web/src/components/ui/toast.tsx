'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
}

interface ToastApi {
  toast: (t: { type?: ToastType; title: string; message?: string; duration?: number }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastType, { icon: React.ElementType; tile: string; bar: string; glow: string }> = {
  success: { icon: CheckCircle2, tile: 'from-brand-400 to-brand-600', bar: 'from-brand-400 to-brand-400', glow: 'shadow-brand-500/25' },
  error: { icon: XCircle, tile: 'from-rose-400 to-brand-600', bar: 'from-rose-400 to-brand-400', glow: 'shadow-rose-500/25' },
  warning: { icon: AlertTriangle, tile: 'from-gray-400 to-gray-500', bar: 'from-gray-400 to-gray-400', glow: 'shadow-gray-500/25' },
  info: { icon: Info, tile: 'from-brand-400 to-brand-500', bar: 'from-brand-400 to-brand-400', glow: 'shadow-brand-500/25' },
};

/** Extracts a readable message from an axios/Nest error. */
export function errorMessage(e: any, fallback = 'Something went wrong') {
  const m = e?.response?.data?.message ?? e?.message;
  return Array.isArray(m) ? m.join(', ') : m || fallback;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback<ToastApi['toast']>(
    ({ type = 'info', title, message, duration = 4200 }) => {
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-3), { id, type, title, message, duration }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, message) => toast({ type: 'success', title, message }),
      error: (title, message) => toast({ type: 'error', title, message, duration: 6000 }),
      info: (title, message) => toast({ type: 'info', title, message }),
      warning: (title, message) => toast({ type: 'warning', title, message }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2.5" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const s = STYLES[t.type];
            const Icon = s.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 60, scale: 0.9, filter: 'blur(6px)' }}
                animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 80, scale: 0.92, transition: { duration: 0.22 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={cn('pointer-events-auto relative overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-3.5 pr-10 shadow-2xl backdrop-blur-xl', s.glow)}
                role="status"
              >
                <div className="flex items-start gap-3">
                  <motion.span
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.08 }}
                    className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg', s.tile)}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </motion.span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[13px] font-semibold text-gray-900">{t.title}</p>
                    {t.message && <p className="mt-0.5 text-xs text-gray-500 line-clamp-3">{t.message}</p>}
                  </div>
                </div>
                <button onClick={() => dismiss(t.id)} className="absolute right-2.5 top-2.5 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" />
                </button>
                <motion.span
                  className={cn('absolute bottom-0 left-0 h-[3px] bg-gradient-to-r', s.bar)}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: t.duration / 1000, ease: 'linear' }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
