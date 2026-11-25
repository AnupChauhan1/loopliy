'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { fmtDate, fullName } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { Plus, X, CalendarOff, Palmtree } from 'lucide-react';

export default function LeavePage() {
  const { role, user } = useAuth();
  const canDecide = role === 'admin' || role === 'hr';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ type: 'casual', startDate: '', endDate: '', reason: '' });
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '' });

  const { data: leaves, isLoading } = useQuery({
    queryKey: ['leave'],
    queryFn: () => api.get('/leave').then((r) => r.data),
  });
  const { data: holidays } = useQuery({
    queryKey: ['holidays'],
    queryFn: () => api.get('/leave/holidays').then((r) => r.data),
  });

  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['leave'] }); queryClient.invalidateQueries({ queryKey: ['holidays'] }); };

  const apply = useMutation({
    mutationFn: () => api.post('/leave', form),
    onSuccess: () => { invalidate(); setShowForm(false); setForm({ type: 'casual', startDate: '', endDate: '', reason: '' }); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed'),
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) => api.post(`/leave/${id}/decide`, { action }),
    onSuccess: invalidate,
  });
  const addHoliday = useMutation({
    mutationFn: () => api.post('/leave/holidays', holidayForm),
    onSuccess: () => { invalidate(); setHolidayForm({ name: '', date: '' }); },
  });
  const removeHoliday = useMutation({ mutationFn: (id: string) => api.delete(`/leave/holidays/${id}`), onSuccess: invalidate });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">Leave</h1>
          <p className="text-sm text-gray-500 mt-1">{canDecide ? 'Manage leave requests and holidays' : 'Apply for leave and track requests'}</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="w-full shrink-0 gradient-brand-btn text-white border-0 rounded-xl sm:w-auto"><Plus className="h-4 w-4 mr-1" /> Apply for leave</Button>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-3">
        <Card className="card-premium min-w-0 lg:col-span-2">
          <CardHeader className="min-w-0 pb-3"><CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold"><CalendarOff className="h-4 w-4 shrink-0 text-brand-600" /> {canDecide ? 'All requests' : 'My requests'}</CardTitle></CardHeader>
          <CardContent className="min-w-0 space-y-3 stagger">
            {isLoading ? (
              <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
            ) : !(leaves ?? []).length ? (
              <p className="py-8 text-center text-sm text-gray-400">No leave requests</p>
            ) : (
              (leaves ?? []).map((l: any) => (
                <div key={l.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-200/80 p-3 transition-all duration-200 hover:border-brand-200 hover:shadow-md hover:shadow-brand-100/50 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{canDecide ? fullName(l.user) : `${l.days} day(s)`} {canDecide && <span className="font-normal text-gray-500">· {l.days}d</span>}</p>
                    <p className="mt-0.5 break-words text-xs capitalize text-gray-500">{l.type} · {fmtDate(l.startDate)} → {fmtDate(l.endDate)}</p>
                    {l.reason && <p className="text-xs text-gray-400 mt-1 italic">"{l.reason}"</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <StatusBadge status={l.status} />
                    {canDecide && l.status === 'pending' && (
                      <>
                        <Button size="sm" onClick={() => decide.mutate({ id: l.id, action: 'approve' })} className="gradient-brand-btn text-white border-0 rounded-lg">Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: l.id, action: 'reject' })} className="rounded-lg border-rose-200 text-rose-600">Reject</Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="card-premium min-w-0">
          <CardHeader className="min-w-0 pb-3"><CardTitle className="flex min-w-0 items-center gap-2 text-base font-semibold"><Palmtree className="h-4 w-4 shrink-0 text-brand-600" /> Holiday calendar</CardTitle></CardHeader>
          <CardContent className="min-w-0 space-y-2 stagger">
            {(holidays ?? []).map((h: any) => (
              <div key={h.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2.5 transition-colors duration-150 hover:border-brand-200">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-800">{h.name}</p>
                  <p className="text-[11px] text-gray-400">{fmtDate(h.date)}</p>
                </div>
                {canDecide && <button aria-label={`Remove ${h.name}`} onClick={() => removeHoliday.mutate(h.id)} className="flex h-10 w-10 shrink-0 items-center justify-center text-gray-300 hover:text-rose-500"><X className="h-4 w-4" /></button>}
              </div>
            ))}
            {canDecide && (
              <div className="grid min-w-0 grid-cols-1 gap-2 pt-1 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="Holiday" className="min-w-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs" />
                <input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} className="min-w-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs" />
                <Button size="sm" variant="outline" onClick={() => addHoliday.mutate()} disabled={!holidayForm.name || !holidayForm.date} className="w-full rounded-lg sm:w-auto">Add</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fade-in" onClick={() => setShowForm(false)}>
          <Card className="w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold">Apply for leave</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); setError(''); apply.mutate(); }} className="space-y-4">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                  <option value="casual">Casual leave</option>
                  <option value="sick">Sick leave</option>
                  <option value="earned">Earned leave</option>
                  <option value="unpaid">Unpaid leave</option>
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-xs text-gray-500">From</label><input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
                  <div><label className="mb-1 block text-xs text-gray-500">To</label><input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
                </div>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason" rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                {error && <p className="text-xs text-rose-600">{error}</p>}
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={apply.isPending} className="flex-1 gradient-brand-btn text-white border-0 rounded-xl">{apply.isPending ? 'Submitting...' : 'Submit request'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
