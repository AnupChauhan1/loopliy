'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { useToast, errorMessage } from '@/components/ui/toast';

export type TrackerStatus = 'idle' | 'running' | 'paused';

export interface TimeEntry {
  id: string;
  taskId: string | null;
  task: { id: string; title: string; taskNumber: string | null; status: string } | null;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  notes: string | null;
  status: 'running' | 'paused' | 'stopped';
  segmentStart: string | null;
  elapsedSeconds: number;
  serverNow: string;
}

interface TrackerApi {
  entry: TimeEntry | null;
  status: TrackerStatus;
  setClockVisible: (visible: boolean) => void;
  /** current elapsed working seconds (ticks every second while running) */
  elapsed: number;
  /** server-corrected current time (ticks every second) */
  now: Date;
  ready: boolean;
  busy: boolean;
  start: (taskId?: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: (notes?: string) => Promise<TimeEntry | null>;
  reset: () => Promise<void>;
}

const CACHE_KEY = 'time_tracker_cache';
const CURRENT_KEY = ['time-tracker', 'current'];
const Ctx = createContext<TrackerApi | null>(null);

export function formatHMS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Tick only while the timer or its clock panel is visible, and pause in background tabs. */
function useSecondTick(active: boolean) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (timeout) clearTimeout(timeout);
      if (interval) clearInterval(interval);
      timeout = undefined;
      interval = undefined;
    };
    const start = () => {
      stop();
      if (!active || document.visibilityState !== 'visible') return;
      setTick(Date.now());
      timeout = setTimeout(() => {
        setTick(Date.now());
        interval = setInterval(() => setTick(Date.now()), 1000);
      }, 1000 - (Date.now() % 1000));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active]);
  return tick;
}

function readCache(): TimeEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as TimeEntry | null) : null;
  } catch {
    return null;
  }
}

export function TimeTrackerProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [clockVisible, setClockVisible] = useState(false);
  const [cached] = useState<TimeEntry | null>(() => (typeof window === 'undefined' ? null : readCache()));

  // Server is the source of truth; the localStorage copy only bridges the first paint after a refresh.
  const { data, isSuccess } = useQuery({
    queryKey: CURRENT_KEY,
    queryFn: async () => {
      const t0 = Date.now();
      const { data } = await api.get('/time-entries/current');
      const t1 = Date.now();
      return {
        entry: (data.entry ?? null) as TimeEntry | null,
        skew: new Date(data.serverNow).getTime() - (t0 + t1) / 2,
      };
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const entry = isSuccess ? data?.entry ?? null : cached;
  const skew = data?.skew ?? 0;
  const status: TrackerStatus = entry?.status === 'running' ? 'running' : entry?.status === 'paused' ? 'paused' : 'idle';
  const tick = useSecondTick(status === 'running' || clockVisible);
  const setClockVisibility = useCallback((visible: boolean) => setClockVisible(visible), []);

  // Mirror to localStorage and keep other tabs in sync.
  useEffect(() => {
    if (!isSuccess) return;
    localStorage.setItem(CACHE_KEY, JSON.stringify(data?.entry ?? null));
  }, [data, isSuccess]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY) queryClient.invalidateQueries({ queryKey: CURRENT_KEY });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queryClient]);

  const now = new Date(tick + skew);
  const elapsed = entry
    ? (entry.duration ?? 0) + (status === 'running' && entry.segmentStart ? Math.max(0, (now.getTime() - new Date(entry.segmentStart).getTime()) / 1000) : 0)
    : 0;

  const setEntry = useCallback(
    (e: TimeEntry | null) => {
      const current = e && e.status !== 'stopped' ? e : null;
      queryClient.setQueryData(CURRENT_KEY, {
        entry: current,
        skew: current ? new Date(current.serverNow).getTime() - Date.now() : 0,
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(current));
    },
    [queryClient],
  );

  const mutation = useMutation({
    mutationFn: async ({ action, taskId, notes }: { action: 'start' | 'pause' | 'resume' | 'stop' | 'reset'; taskId?: string; notes?: string }) => {
      if (action === 'start') return (await api.post('/time-entries/start', { taskId: taskId || undefined })).data as TimeEntry;
      if (!entry) throw new Error('No active timer');
      const { data } = await api.post(`/time-entries/${entry.id}/${action}`, action === 'stop' ? { notes } : {});
      return (action === 'reset' ? null : data) as TimeEntry | null;
    },
    onError: (e: any) => {
      toast.error('Time tracker', errorMessage(e));
      // a 409/400 means our view is stale (e.g. another tab) — resync
      queryClient.invalidateQueries({ queryKey: CURRENT_KEY });
    },
  });

  const run = useCallback(
    async (action: 'start' | 'pause' | 'resume' | 'stop' | 'reset', extra: { taskId?: string; notes?: string } = {}) => {
      try {
        const result = await mutation.mutateAsync({ action, ...extra });
        setEntry(result);
        if (action === 'stop') {
          queryClient.invalidateQueries({ queryKey: ['time-entries'] });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['task'] });
        }
        return result;
      } catch {
        return undefined; // failure (null is a valid result: reset)
      }
    },
    [mutation, setEntry, queryClient],
  );

  const value = useMemo<TrackerApi>(
    () => ({
      entry,
      status,
      setClockVisible: setClockVisibility,
      elapsed,
      now,
      ready: isSuccess,
      busy: mutation.isPending,
      start: async (taskId) => {
        const e = await run('start', { taskId });
        if (e) toast.success('Time tracking started', e.task ? `Tracking “${e.task.title}”` : 'Tracking general work');
      },
      pause: async () => {
        if (await run('pause')) toast.info('Timer paused', 'Resume whenever you are ready.');
      },
      resume: async () => {
        if (await run('resume')) toast.info('Timer resumed');
      },
      stop: async (notes) => {
        const e = await run('stop', { notes });
        if (e) toast.success(`Saved ${formatHMS(e.duration ?? 0)} of work`, e.task ? `Logged to “${e.task.title}”` : 'Logged as general work');
        return e ?? null;
      },
      reset: async () => {
        if ((await run('reset')) !== undefined) toast.warning('Timer reset', 'The session was discarded and not saved.');
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, status, setClockVisibility, elapsed, tick, isSuccess, mutation.isPending, run, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTimeTracker() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTimeTracker must be used within TimeTrackerProvider');
  return ctx;
}
