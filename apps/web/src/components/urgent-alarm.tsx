'use client';

import { useEffect, useRef, useState } from 'react';
import { Siren, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DONE_STATUSES = ['completed', 'cancelled', 'approved'];

/**
 * Pulsing urgent-task alarm. Shows a banner and plays a Web Audio chime loop
 * while the employee has Urgent or carried-over overdue tasks. The
 * "Acknowledge / Start Task" button silences the alarm for this session.
 */
export function UrgentAlarm({ tasks }: { tasks: any[] }) {
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const audioRef = useRef<{ ctx: AudioContext | null; timer: number | null }>({ ctx: null, timer: null });

  const urgent = (tasks ?? []).filter(
    (t) => (t.priority === 'urgent' || t.isOverdue) && !DONE_STATUSES.includes(t.status) && !acknowledged.has(t.id),
  );
  const active = urgent.length > 0;

  const stopChime = () => {
    const a = audioRef.current;
    if (a.timer) { window.clearInterval(a.timer); a.timer = null; }
    if (a.ctx && a.ctx.state !== 'closed') void a.ctx.close().catch(() => {});
    a.ctx = null;
  };

  useEffect(() => {
    if (!active) {
      stopChime();
      return;
    }

    const chime = () => {
      try {
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctx) return;
        if (!audioRef.current.ctx || audioRef.current.ctx.state === 'closed') {
          audioRef.current.ctx = new Ctx();
        }
        const ctx = audioRef.current.ctx;
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
        const now = ctx.currentTime;
        [880, 660].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const start = now + i * 0.18;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.22, start + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
          osc.connect(gain).connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.35);
        });
      } catch {
        // Audio blocked until a user gesture — retry on next interval tick
      }
    };

    chime();
    audioRef.current.timer = window.setInterval(chime, 2200);
    const resume = () => audioRef.current.ctx?.resume().catch(() => {});
    window.addEventListener('pointerdown', resume, { once: true });

    return () => {
      if (audioRef.current.timer) window.clearInterval(audioRef.current.timer);
      audioRef.current.timer = null;
      window.removeEventListener('pointerdown', resume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => () => stopChime(), []);

  if (!active) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-rose-300 bg-gradient-to-r from-rose-600 via-rose-500 to-orange-500 p-4 text-white shadow-xl shadow-rose-500/30">
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.25),transparent_45%)]" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30">
            <Siren className="h-5 w-5 animate-pulse" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-wide">
              URGENT TASK ALERT — {urgent.length} task{urgent.length > 1 ? 's' : ''} require{urgent.length === 1 ? 's' : ''} immediate attention
            </p>
            <p className="mt-0.5 text-xs text-rose-100">
              {urgent.slice(0, 3).map((t) => t.title).join(' · ')}
              {urgent.length > 3 ? ` · +${urgent.length - 3} more` : ''}
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            setAcknowledged((prev) => new Set([...prev, ...urgent.map((t) => t.id)]));
            stopChime();
          }}
          className="shrink-0 rounded-xl bg-white text-rose-700 shadow-lg hover:bg-rose-50"
        >
          <CheckCheck className="mr-2 h-4 w-4" />
          Acknowledge / Start Task
        </Button>
      </div>
    </div>
  );
}
