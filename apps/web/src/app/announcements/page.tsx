'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fmtDate, fullName } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { Megaphone, Plus, X, Trash2 } from 'lucide-react';

export default function AnnouncementsPage() {
  const { role } = useAuth();
  const canPost = role !== 'employee';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', departmentId: '' });

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get('/announcements').then((r) => r.data),
  });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data) });

  const create = useMutation({
    mutationFn: () => api.post('/announcements', { ...form, departmentId: form.departmentId || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['announcements'] }); setShowForm(false); setForm({ title: '', content: '', departmentId: '' }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">Announcements</h1>
          <p className="text-sm text-gray-500 mt-1">Company and department updates</p>
        </div>
        {canPost && (
          <Button onClick={() => setShowForm(true)} className="gradient-brand-btn text-white border-0 rounded-xl"><Plus className="h-4 w-4 mr-1" /> New announcement</Button>
        )}
      </div>

      <div className="space-y-3 max-w-3xl stagger">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>
        ) : !(announcements ?? []).length ? (
          <Card className="card-premium"><CardContent className="flex flex-col items-center py-14 text-gray-400"><Megaphone className="h-8 w-8 mb-2 opacity-40" /><p className="text-sm">No announcements yet</p></CardContent></Card>
        ) : (
          (announcements ?? []).map((a: any) => (
            <Card key={a.id} className="card-premium">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-semibold text-gray-900">{a.title}</h3>
                    <p className="mt-1.5 text-sm text-gray-600 whitespace-pre-wrap">{a.content}</p>
                    <p className="mt-2.5 text-[11px] text-gray-400">
                      {a.author ? fullName(a.author) : 'System'} · {fmtDate(a.createdAt)}
                      {a.department ? ` · ${a.department.name} only` : ' · Everyone'}
                    </p>
                  </div>
                  {canPost && <button onClick={() => remove.mutate(a.id)} className="rounded-lg p-1.5 text-gray-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fade-in" onClick={() => setShowForm(false)}>
          <Card className="w-full max-w-md animate-scale-in shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold">New announcement</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                <textarea required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Message" rows={4} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                  <option value="">Everyone</option>
                  {(departments ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name} only</option>)}
                </select>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending} className="flex-1 gradient-brand-btn text-white border-0 rounded-xl">{create.isPending ? 'Posting...' : 'Post'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
