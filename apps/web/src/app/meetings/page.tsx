'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { Video, Plus, Link2, Copy, Check, Users, Clock, Loader2, CalendarClock } from 'lucide-react';
import { db } from '@/lib/firestore';
import { createMeetingRoom, myId, type MeetingRoom } from '@/lib/meet';
import { useAuth } from '@/lib/auth-context';
import { fullName, timeAgo, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function MeetingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRoom[]>([]);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'meetings'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      setMeetings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MeetingRoom)));
    }, () => setMeetings([]));
  }, []);

  const startInstant = async () => {
    setCreating(true);
    try {
      const id = await createMeetingRoom({
        title: title.trim() || 'Client Meeting',
        hostName: user ? fullName(user) || user.email : 'Host',
      });
      router.push(`/meet/${id}`);
    } catch {
      setCreating(false);
    }
  };

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/meet/${id}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 1600);
    } catch { /* noop */ }
  };

  const active = meetings.filter((m) => m.status === 'active');
  const past = meetings.filter((m) => m.status !== 'active');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"><Video className="h-4.5 w-4.5" /></span>
            Meetings
          </h1>
          <p className="mt-1 text-sm text-slate-500">HD video, screen sharing &amp; live chat with clients — peer-to-peer, no downloads.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void startInstant()}
            placeholder="Meeting title (optional)"
            className="h-11 w-56 rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
          <button
            onClick={() => void startInstant()}
            disabled={creating}
            className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 text-sm font-semibold text-white shadow-[0_8px_20px_-4px_rgba(5,150,105,0.45)] transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Start Instant Meeting
          </button>
        </div>
      </div>

      {active.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live now
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((m) => <MeetingCard key={m.id} m={m} live copied={copiedId === m.id} onCopy={copyLink} onJoin={() => router.push(`/meet/${m.id}`)} />)}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <CalendarClock className="h-3.5 w-3.5" /> Recent meetings
        </h2>
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 py-14 text-center">
            <Video className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No meetings yet — start your first client call.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((m) => <MeetingCard key={m.id} m={m} live={false} copied={copiedId === m.id} onCopy={copyLink} onJoin={() => router.push(`/meet/${m.id}`)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function MeetingCard({ m, live, copied, onCopy, onJoin }: { m: MeetingRoom; live: boolean; copied: boolean; onCopy: (id: string) => void; onJoin: () => void }) {
  return (
    <div className={cn('rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md', live ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{m.title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{m.projectName ?? 'General meeting'} • hosted by {m.hostName}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', live ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
          {live ? 'Live' : m.durationSec ? `${Math.floor(m.durationSec / 60)}m ${m.durationSec % 60}s` : 'Ended'}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(m.createdAt?.toDate?.() ?? m.createdAt)}</span>
        {m.clientName && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {m.clientName}</span>}
      </div>
      <div className="mt-3.5 flex items-center gap-2">
        <button onClick={onJoin} className={cn('flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition', live ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-900 text-white hover:bg-slate-800')}>
          <Video className="h-3.5 w-3.5" /> {live ? 'Join now' : 'View'}
        </button>
        <button onClick={() => onCopy(m.id)} title="Copy guest invite link" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-emerald-300 hover:text-emerald-600">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
