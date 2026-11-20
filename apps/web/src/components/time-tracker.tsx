'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Watch, X, Play, Pause, Square, RotateCcw, Clock3, ListChecks, CalendarClock, ExternalLink } from 'lucide-react';
import api from '@/lib/api-client';
import { formatHMS, useTimeTracker, type TimeEntry } from '@/lib/time-tracker';
import { LottieAnim } from '@/components/ui/lottie';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Digital readout whose digits roll when they change. */
function Digits({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex tabular font-mono', className)} aria-label={value}>
      {value.split('').map((ch, i) =>
        ch === ':' ? (
          <span key={i} className="mx-[1px] opacity-50" aria-hidden>:</span>
        ) : (
          <span key={i} className="relative inline-block w-[0.62em] overflow-hidden text-center" aria-hidden>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={ch}
                className="inline-block"
                initial={{ y: '-70%', opacity: 0, filter: 'blur(3px)' }}
                animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: '70%', opacity: 0, filter: 'blur(3px)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        ),
      )}
    </span>
  );
}

function StatusChip({ status }: { status: 'idle' | 'running' | 'paused' }) {
  const s = {
    running: { label: 'Tracking', cls: 'bg-brand-50 text-brand-700 ring-brand-200', dot: 'bg-brand-500' },
    paused: { label: 'Paused', cls: 'bg-gray-50 text-gray-700 ring-gray-200', dot: 'bg-gray-500' },
    idle: { label: 'Not tracking', cls: 'bg-gray-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  }[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1', s.cls)}>
      <span className="relative flex h-2 w-2">
        {status === 'running' && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', s.dot)} />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', s.dot)} />
      </span>
      {s.label}
    </span>
  );
}

function ControlButton({
  onClick,
  disabled,
  tone,
  icon: Icon,
  children,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone: 'primary' | 'amber' | 'dark' | 'ghost' | 'danger';
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    primary: 'gradient-brand-btn text-white',
    amber: 'bg-white text-gray-900 ring-1 ring-gray-300 shadow-sm hover:ring-brand-400 hover:text-brand-700',
    dark: 'bg-gray-900 text-white shadow-[0_8px_20px_-8px_rgba(17,24,39,0.7)] hover:bg-gray-800',
    ghost: 'bg-white text-gray-600 ring-1 ring-gray-200 hover:text-gray-900 hover:ring-gray-300',
    danger: 'bg-red-600 text-white shadow-[0_8px_20px_-8px_rgba(220,38,38,0.7)] hover:bg-red-700',
  }[tone];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      className={cn('flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50', tones, className)}
    >
      <Icon className="h-4 w-4" />
      {children}
    </motion.button>
  );
}

function TrackerPanel({ onClose }: { onClose: () => void }) {
  const t = useTimeTracker();
  const [taskId, setTaskId] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [saved, setSaved] = useState<TimeEntry | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: tasksData } = useQuery({
    queryKey: ['tasks', 'tracker-options'],
    queryFn: () => api.get('/tasks/my', { params: { limit: 100 } }).then((r) => r.data),
  });
  const { data: history } = useQuery({
    queryKey: ['time-entries', 'recent'],
    queryFn: () => api.get('/time-entries', { params: { limit: 3 } }).then((r) => r.data as { entries: TimeEntry[]; todaySeconds: number }),
  });
  const openTasks: any[] = (tasksData?.tasks ?? []).filter((x: any) => !['completed', 'cancelled', 'approved'].includes(x.status));

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimer.current = setTimeout(() => setConfirmReset(false), 3500);
      return;
    }
    clearTimeout(resetTimer.current);
    setConfirmReset(false);
    t.reset();
  };

  const handleStop = async () => {
    const e = await t.stop(notes.trim() || undefined);
    if (e) {
      setNotes('');
      setSaved(e);
      setTimeout(() => setSaved(null), 2600);
    }
  };

  const clock = t.now;
  const clockStr = clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = clock.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayTotal = (history?.todaySeconds ?? 0) + (t.status !== 'idle' ? t.elapsed : 0);

  return (
    <motion.div
      role="dialog"
      aria-label="Time tracker"
      initial={{ opacity: 0, y: -14, scale: 0.94, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      exit={{ opacity: 0, y: -10, scale: 0.96, filter: 'blur(6px)', transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      style={{ transformOrigin: 'top right' }}
      className="fixed left-3 right-3 top-[72px] z-[90] max-h-[calc(100vh-88px)] overflow-y-auto rounded-3xl border border-white/70 bg-white/80 shadow-[0_40px_90px_-30px_rgba(17,24,39,0.55)] ring-1 ring-gray-900/5 backdrop-blur-2xl sm:left-auto sm:right-4 sm:w-[372px]"
    >
      {/* ambient gradients */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 top-32 h-40 w-40 rounded-full bg-brand-300/25 blur-3xl" />

      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-[0_8px_18px_-6px_rgba(0,168,120,0.7)]">
              <Watch className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-sm font-bold text-gray-900">Time Tracker</p>
              <p className="text-[11px] text-gray-500">Closing this keeps the timer running</p>
            </div>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 ring-1 ring-gray-200 hover:bg-white hover:text-gray-700"
            aria-label="Close time tracker"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        {/* Live clock */}
        <div className="mt-4 overflow-hidden rounded-2xl bg-[radial-gradient(120%_120%_at_100%_0%,rgba(0,168,120,0.28),transparent_55%),linear-gradient(135deg,#0B1220,#111827)] p-4 text-white shadow-inner ring-1 ring-white/10">
          <div className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Current time</span>
            <span className="truncate pl-2 normal-case tracking-normal">{tz}</span>
          </div>
          <div className="mt-1.5 text-[34px] font-bold leading-none tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-100 to-brand-200">
            <Digits value={clockStr} />
          </div>
          <p className="mt-1 text-xs text-gray-400">{dateStr}</p>
        </div>

        {/* Tracker */}
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-gray-200/70 bg-white/80 p-4">
          <AnimatePresence>
            {saved && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/95 backdrop-blur"
              >
                <LottieAnim name="success" size={92} loop={false} />
                <p className="text-sm font-bold text-gray-900">Saved {formatHMS(saved.duration ?? 0)}</p>
                <p className="text-xs text-gray-500">{saved.task ? saved.task.title : 'General work'}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400">Working time</span>
            <StatusChip status={t.status} />
          </div>
          <div
            className={cn(
              'mt-1.5 text-[40px] font-extrabold leading-none tracking-tight transition-colors duration-300',
              t.status === 'running' ? 'text-gray-900' : t.status === 'paused' ? 'text-gray-600' : 'text-gray-300',
            )}
          >
            <motion.div animate={t.status === 'paused' ? { opacity: [1, 0.45, 1] } : { opacity: 1 }} transition={t.status === 'paused' ? { duration: 1.6, repeat: Infinity } : {}}>
              <Digits value={formatHMS(t.elapsed)} />
            </motion.div>
          </div>

          {/* task association */}
          <div className="mt-3">
            {t.entry ? (
              <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-gray-200/70">
                <ListChecks className="h-4 w-4 shrink-0 text-brand-600" />
                {t.entry.task ? (
                  <Link href={`/tasks/${t.entry.task.id}`} onClick={onClose} className="group flex min-w-0 flex-1 items-center gap-1 text-[12.5px] font-semibold text-gray-800 hover:text-brand-700">
                    <span className="truncate">{t.entry.task.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ) : (
                  <span className="text-[12.5px] font-medium text-gray-500">General work (no task)</span>
                )}
              </div>
            ) : (
              <label className="block">
                <span className="field-label">Track time for</span>
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="field field-sm">
                  <option value="">General work (no task)</option>
                  {openTasks.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.taskNumber ? `${x.taskNumber} · ` : ''}{x.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {t.entry && (
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What are you working on? (saved on stop)"
              maxLength={500}
              className="field field-sm mt-2"
            />
          )}

          {/* Controls */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {t.status === 'idle' ? (
              <ControlButton tone="primary" icon={Play} onClick={() => t.start(taskId || undefined)} disabled={t.busy || !t.ready} className="col-span-2">
                Start tracking
              </ControlButton>
            ) : (
              <>
                {t.status === 'running' ? (
                  <ControlButton tone="amber" icon={Pause} onClick={t.pause} disabled={t.busy}>Pause</ControlButton>
                ) : (
                  <ControlButton tone="primary" icon={Play} onClick={t.resume} disabled={t.busy}>Resume</ControlButton>
                )}
                <ControlButton tone="dark" icon={Square} onClick={handleStop} disabled={t.busy}>Stop &amp; save</ControlButton>
                <ControlButton tone={confirmReset ? 'danger' : 'ghost'} icon={RotateCcw} onClick={handleReset} disabled={t.busy} className="col-span-2">
                  {confirmReset ? 'Click again to discard this session' : 'Reset'}
                </ControlButton>
              </>
            )}
          </div>
        </div>

        {/* Today + recent */}
        <div className="mt-3 rounded-2xl border border-gray-200/70 bg-white/70 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-600"><CalendarClock className="h-4 w-4 text-brand-500" /> Today</span>
            <span className="text-sm font-extrabold text-gray-900 tabular">{formatHMS(todayTotal)}</span>
          </div>
          <div className="mt-2 space-y-1">
            {(history?.entries ?? []).length === 0 ? (
              <p className="py-1 text-[11.5px] text-gray-400">No saved sessions yet.</p>
            ) : (
              history!.entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[11.5px] hover:bg-gray-50">
                  <span className="truncate text-gray-600">{e.task?.title ?? 'General work'}</span>
                  <span className="shrink-0 text-gray-400">{timeAgo(e.endTime)} · <span className="font-semibold text-gray-700 tabular">{formatHMS(e.duration ?? 0)}</span></span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Header watch button + floating tracker panel. */
export function TimeTrackerButton() {
  const t = useTimeTracker();
  const { setClockVisible } = t;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelHost = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setClockVisible(open);
  }, [open, setClockVisible]);
  useEffect(() => () => setClockVisible(false), [setClockVisible]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelHost.current?.contains(target)) return;
      // ignore clicks inside portaled toasts / native selects
      if ((target as HTMLElement).closest?.('[role="status"]')) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const active = t.status !== 'idle';

  return (
    <div ref={wrapRef} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.93 }}
        className={cn(
          'group relative flex h-10 items-center gap-2 rounded-xl px-2.5 text-gray-500 transition-all duration-300',
          active ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100/70' : 'hover:bg-gray-100 hover:text-gray-800',
          open && !active && 'bg-gray-100 text-gray-800',
        )}
        aria-label={active ? `Time tracker (${t.status}, ${formatHMS(t.elapsed)})` : 'Open time tracker'}
        aria-expanded={open}
      >
        <span className="relative flex">
          <motion.span
            className="flex"
            whileHover={{ rotate: [0, -14, 12, -6, 0] }}
            transition={{ duration: 0.6 }}
          >
            <Watch className="h-5 w-5" />
          </motion.span>
          <span className="pointer-events-none absolute inset-0 rounded-full opacity-0 shadow-[0_0_16px_4px_rgba(0,168,120,0.45)] transition-opacity duration-300 group-hover:opacity-100" />
          {active && (
            <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
              {t.status === 'running' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />}
              <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-white', t.status === 'running' ? 'bg-brand-500' : 'bg-gray-500')} />
            </span>
          )}
        </span>
        <AnimatePresence initial={false}>
          {active && (
            <motion.span
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="hidden overflow-hidden whitespace-nowrap text-[13px] font-bold tabular sm:block"
            >
              {formatHMS(t.elapsed)}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {mounted &&
        createPortal(
          <div ref={panelHost}>
            <AnimatePresence>{open && <TrackerPanel onClose={() => setOpen(false)} />}</AnimatePresence>
          </div>,
          document.body,
        )}
    </div>
  );
}
