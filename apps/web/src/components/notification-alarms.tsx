'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import api from '@/lib/api-client';
import { playNotificationChime, isNotifyMuted } from '@/lib/sound';
import { BellRing, Volume2, VolumeX, X } from 'lucide-react';

interface AlarmToast {
  id: string;
  title: string;
  message: string;
  link?: string;
}

const MAX_TOASTS = 3;

/**
 * Real-time-ish notification alarms: polls the notifications endpoint and,
 * for every newly arrived unread notification, rings a Web-Audio chime and
 * shows a floating toast. Old notifications never alert on page load.
 */
export function NotificationAlarms() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [toasts, setToasts] = useState<AlarmToast[]>([]);
  const [muted, setMuted] = useState(false);
  const seenRef = useRef<Set<string> | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    setMuted(isNotifyMuted());
    mutedRef.current = isNotifyMuted();
    const sync = () => { const m = isNotifyMuted(); setMuted(m); mutedRef.current = m; };
    window.addEventListener('looply:sound-toggle', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('looply:sound-toggle', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Unlock Web Audio on the first user interaction anywhere in the app
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (Ctx) { const ctx = new Ctx(); void ctx.resume().catch(() => {}); void ctx.close().catch(() => {}); }
      } catch { /* ignore */ }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const { data } = useQuery({
    queryKey: ['notifications', 'alarms'],
    queryFn: () => api.get('/notifications').then((r) => r.data as any[]),
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 5000 : false,
  });

  useEffect(() => {
    if (!data) return;
    const fresh = data.filter((n) => !n.read);
    if (seenRef.current === null) {
      // First load — remember everything, never alert for history
      seenRef.current = new Set(data.map((n) => n.id));
      return;
    }
    const arrivals = fresh.filter((n) => !seenRef.current!.has(n.id));
    if (!arrivals.length) return;
    for (const n of data) seenRef.current.add(n.id);

    // Keep bell badge + task lists in sync instantly
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    const taskArrivals = arrivals.filter((n) => n.type === 'task_assigned');
    if (!taskArrivals.length) return;

    if (!mutedRef.current) playNotificationChime(0.45);
    setToasts((prev) => [
      ...taskArrivals.slice(0, MAX_TOASTS).map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        link: n.data?.link ?? (n.data?.taskId ? `/tasks/${n.data.taskId}` : undefined),
      })),
      ...prev,
    ].slice(0, MAX_TOASTS));
  }, [data, queryClient]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((prev) => prev.slice(1)), 8000);
    return () => clearTimeout(t);
  }, [toasts]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-emerald-200 bg-white/95 shadow-[0_20px_50px_-15px_rgba(16,185,129,0.45)] ring-1 ring-emerald-100 backdrop-blur-xl"
          >
            <div className="flex items-start gap-3 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/30">
                <BellRing className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-gray-900">{t.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{t.message}</p>
                {t.link && (
                  <button
                    onClick={() => { setToasts((prev) => prev.filter((x) => x.id !== t.id)); router.push(t.link!); }}
                    className="mt-1.5 text-xs font-semibold text-emerald-600 transition hover:text-emerald-700"
                  >
                    View Task →
                  </button>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  className="rounded-md p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-500"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { const m = !mutedRef.current; mutedRef.current = m; localStorage.setItem('looply_notify_muted', m ? '1' : '0'); setMuted(m); window.dispatchEvent(new Event('looply:sound-toggle')); }}
                  className="rounded-md p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-500"
                  title={muted ? 'Unmute alerts' : 'Mute alerts'}
                  aria-label={muted ? 'Unmute alerts' : 'Mute alerts'}
                >
                  {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
