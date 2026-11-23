'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { fmtDate, fullName, initials } from '@/lib/format';

const stageOf = (u: any) =>
  u.rejectedAt ? 'rejected'
  : u.approvedAt ? 'approved'
  : !u.emailVerified ? 'unverified'
  : !u.hrApprovedAt ? 'hr_pending'
  : 'admin_pending';

const STAGE_META: Record<string, { label: string; cls: string }> = {
  unverified: { label: 'Unverified', cls: 'bg-gray-100 text-gray-600' },
  hr_pending: { label: 'Pending HR review', cls: 'bg-amber-100 text-amber-700' },
  admin_pending: { label: 'Pending admin approval', cls: 'bg-sky-100 text-sky-700' },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700' },
};

export function PendingApprovals() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => api.get('/users', { params: { stage: 'all_pending' } }).then((r) => r.data),
    refetchInterval: 15000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['registration-stats'] });
  };

  const act = async (u: any, kind: 'hr' | 'admin', approve: boolean) => {
    const name = fullName(u);
    let reason: string | undefined;
    if (!approve) {
      const r = window.prompt(`Reason for rejecting ${name}'s registration (visible to them):`);
      if (r === null) return;
      reason = r || undefined;
    } else if (!window.confirm(`${kind === 'hr' ? 'HR' : 'Admin'} approve ${name}?`)) {
      return;
    }
    setBusyId(u.id);
    try {
      await api.post(`/users/${u.id}/${kind}-${approve ? 'approve' : 'reject'}`, approve ? {} : { reason });
      invalidate();
    } catch (err: any) {
      window.alert(err?.response?.data?.message || 'Action failed');
    } finally {
      setBusyId('');
    }
  };

  const pending = (users as any[]).filter((u) => stageOf(u) !== 'approved' && stageOf(u) !== 'rejected');
  if (pending.length === 0) return null;

  return (
    <Card className="card-premium">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            Pending account approvals
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">{pending.length}</span>
          </h3>
          <span className="text-[11px] text-gray-400">Auto-refreshes</span>
        </div>
        <div className="space-y-2.5">
          {pending.map((u) => {
            const stage = stageOf(u);
            const meta = STAGE_META[stage];
            const busy = busyId === u.id;
            const isAdmin = role === 'admin';
            return (
              <div key={u.id} className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {u.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-brand-100" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full gradient-brand text-xs font-semibold text-white">
                      {initials(u.firstName, u.lastName)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{fullName(u)}</p>
                    <p className="truncate text-xs text-gray-500">{u.email}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {(u.roleNames ?? []).map((r: string) => (
                        <span key={r} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200">{r}</span>
                      ))}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                        <Clock className="h-3 w-3" />{fmtDate(u.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {stage === 'hr_pending' && u.emailVerified && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => act(u, 'hr', true)}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> HR Approve
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => act(u, 'hr', false)}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </>
                  )}
                  {stage === 'admin_pending' && isAdmin && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => act(u, 'admin', true)}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Admin Approve
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => act(u, 'admin', false)}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </>
                  )}
                  {stage === 'admin_pending' && !isAdmin && (
                    <span className="text-[11px] font-medium text-sky-600">Awaiting admin</span>
                  )}
                  {stage === 'unverified' && (
                    <span className="text-[11px] text-gray-400">Awaiting email verification</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
