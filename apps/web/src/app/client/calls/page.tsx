'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Phone, PhoneOff, Video } from 'lucide-react';
import api from '@/lib/api-client';

interface CallRecord {
  id: string; type: 'audio' | 'video'; status: string;
  startedAt: string | null; createdAt: string; endedAt: string | null; duration: number | null;
  initiatedBy?: { firstName: string; lastName: string } | null;
  conversation?: { name: string | null; type: string } | null;
  participants?: { user?: { firstName: string; lastName: string } | null }[];
}

const fmtDuration = (s?: number | null) =>
  s == null ? '—' : `${Math.floor(s / 60)}m ${s % 60}s`;
const statusStyle = (s: string) =>
  s === 'completed' ? 'bg-emerald-100 text-emerald-700' : s === 'missed' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600';

export default function ClientCallsPage() {
  const calls = useQuery<CallRecord[]>({
    queryKey: ['client-call-history'],
    queryFn: () => api.get<CallRecord[]>('/chat/calls/history').then((r) => r.data),
  });
  const items = calls.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Call history</h1>
        <p className="mt-1 text-sm text-gray-500">Your audio and video calls with the LOOPLY team.</p>
      </div>
      {calls.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}
      {!calls.isLoading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          <Phone className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          No calls yet. Start a call from your Messages page.
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {items.map((c) => {
          const other = c.participants?.find((p) => p.user)?.user;
          const name = other
            ? `${other.firstName} ${other.lastName}`
            : c.initiatedBy
              ? `${c.initiatedBy.firstName} ${c.initiatedBy.lastName}`
              : c.conversation?.name ?? 'Team member';
          const when = c.startedAt ?? c.createdAt;
          return (
            <div key={c.id} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full ${c.type === 'video' ? 'bg-violet-100 text-violet-600' : 'bg-brand-100 text-brand-600'}`}>
                {c.type === 'video' ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{name}</p>
                <p className="text-xs text-gray-400">
                  {new Date(when).toLocaleString()} · {c.type === 'video' ? 'Video' : 'Audio'} · {fmtDuration(c.duration)}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(c.status)}`}>
                {c.status === 'missed' ? <span className="inline-flex items-center gap-1"><PhoneOff className="h-3 w-3" />Missed</span> : c.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
