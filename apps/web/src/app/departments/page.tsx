'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fullName, initials } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { Network, Plus, Users, FolderKanban, CheckSquare, X, Archive, Pencil } from 'lucide-react';

export default function DepartmentsPage() {
  const { role } = useAuth();
  const canEdit = role === 'admin';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', color: '#00A878', headId: '' });
  const [error, setError] = useState('');

  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['departments'] });

  const save = useMutation({
    mutationFn: async (): Promise<any> => (editing ? api.put(`/departments/${editing.id}`, form) : api.post('/departments', { ...form, headId: form.headId || null })),
    onSuccess: () => { invalidate(); setShowForm(false); setEditing(null); setForm({ name: '', code: '', description: '', color: '#00A878', headId: '' }); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed'),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.post(`/departments/${id}/archive`),
    onSuccess: invalidate,
  });

  const openEdit = (d: any) => {
    setEditing(d);
    setForm({ name: d.name, code: d.code ?? '', description: d.description ?? '', color: d.color, headId: d.headId ?? '' });
    setShowForm(true);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">Departments</h1>
          <p className="text-sm text-gray-500 mt-1">{departments?.length ?? 0} departments</p>
        </div>
        {canEdit && (
          <Button onClick={() => { setEditing(null); setForm({ name: '', code: '', description: '', color: '#00A878', headId: '' }); setShowForm(true); }} className="gradient-brand-btn text-white border-0 rounded-xl">
            <Plus className="h-4 w-4 mr-1" /> New Department
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 stagger">
          {(departments ?? []).map((d: any) => (
            <Card key={d.id} className="card-premium group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-brand text-white font-bold text-sm shadow-[0_8px_18px_-8px_rgba(0,168,120,0.7)] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                    {d.code ?? d.name.slice(0, 2).toUpperCase()}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(d)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 hover:scale-110"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => archive.mutate(d.id)} title="Archive" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 hover:scale-110"><Archive className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
                <h3 className="mt-3 text-[15px] font-semibold text-gray-900">{d.name}</h3>
                <p className="mt-1 text-xs text-gray-500 line-clamp-2 min-h-[32px]">{d.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[9px] font-semibold text-gray-600">{initials(d.head?.firstName, d.head?.lastName)}</span>
                  <p className="text-xs text-gray-500">Head: {d.head ? fullName(d.head) : '—'}</p>
                </div>
                <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {d._count.members}</span>
                  <span className="flex items-center gap-1"><FolderKanban className="h-3.5 w-3.5" /> {d._count.projects}</span>
                  <span className="flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5" /> {d._count.tasks}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fade-in" onClick={() => setShowForm(false)}>
          <Card className="w-full max-w-md animate-scale-in shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold">{editing ? 'Edit' : 'New'} department</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(); }} className="space-y-4">
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Department name" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Code (e.g. IT)" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-gray-200" />
                    <span className="text-xs text-gray-500">Color</span>
                  </div>
                </div>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Department head</label>
                  <select value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <option value="">None</option>
                    {(users ?? []).map((u: any) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
                  </select>
                </div>
                {error && <p className="text-xs text-rose-600">{error}</p>}
                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={save.isPending} className="flex-1 gradient-brand-btn text-white border-0 rounded-xl">{save.isPending ? 'Saving...' : 'Save'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
