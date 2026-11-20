'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { LayoutGrid, Plus, X, Archive, Pencil } from 'lucide-react';

const ALL_ROLES = ['Super Admin', 'Admin', 'Project Manager', 'HR Manager', 'Employee', 'Graphic Designer', 'Video Editor', 'Sales Manager', 'Developer', 'Client'];

export default function ModulesPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', key: '', description: '', icon: '', menuPosition: '50', status: 'active', roles: [] as string[], departmentIds: [] as string[] });

  const { data: modules, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: () => api.get('/modules').then((r) => r.data),
  });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['modules'] });

  const save = useMutation({
    mutationFn: () => api[editing ? 'put' : 'post'](`/modules${editing ? `/${editing.id}` : ''}`, { ...form, menuPosition: Number(form.menuPosition) || 100 }),
    onSuccess: () => { invalidate(); setShowForm(false); setEditing(null); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed'),
  });
  const archive = useMutation({ mutationFn: (id: string) => api.delete(`/modules/${id}`), onSuccess: invalidate });
  const toggleStatus = useMutation({
    mutationFn: (m: any) => api.put(`/modules/${m.id}`, { status: m.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: invalidate,
  });

  const openEdit = (m: any) => {
    setEditing(m);
    setForm({ name: m.name, key: m.key, description: m.description ?? '', icon: m.icon ?? '', menuPosition: String(m.menuPosition), status: m.status, roles: m.roles ?? [], departmentIds: m.departmentIds ?? [] });
    setShowForm(true);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">Module Registry</h1>
          <p className="text-sm text-gray-500 mt-1">Create and configure functional modules</p>
        </div>
        {role === 'admin' && (
          <Button onClick={() => { setEditing(null); setForm({ name: '', key: '', description: '', icon: '', menuPosition: '50', status: 'active', roles: [], departmentIds: [] }); setShowForm(true); }} className="gradient-brand-btn text-white border-0 rounded-xl"><Plus className="h-4 w-4 mr-1" /> New Module</Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
        {isLoading ? (
          <div className="col-span-3 flex h-32 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>
        ) : (
          (modules ?? []).map((m: any) => (
            <Card key={m.id} className={`card-premium group ${m.status !== 'active' ? 'opacity-60' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
                    <LayoutGrid className="h-5 w-5 text-brand-600" />
                  </div>
                  {role === 'admin' && (
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(m)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 hover:scale-110"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => archive.mutate(m.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 hover:scale-110"><Archive className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
                <h3 className="mt-3 text-sm font-semibold text-gray-900">{m.name}</h3>
                <p className="mt-0.5 text-xs text-gray-500 line-clamp-2 min-h-[30px]">{m.description || m.key}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.status === 'active' ? 'bg-brand-50 text-brand-700' : m.status === 'archived' ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-gray-700'}`}>{m.status}</span>
                  <span className="text-[11px] text-gray-400">pos {m.menuPosition}</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {(m.roles ?? []).slice(0, 4).map((r: string) => (
                    <span key={r} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{r}</span>
                  ))}
                  {(m.roles ?? []).length > 4 && <span className="text-[10px] text-gray-400">+{m.roles.length - 4}</span>}
                </div>
                {role === 'admin' && m.status !== 'archived' && (
                  <button onClick={() => toggleStatus.mutate(m)} className="mt-3 w-full rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-brand-300 transition-all duration-150 active:scale-95">
                    {m.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fade-in" onClick={() => setShowForm(false)}>
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold">{editing ? 'Edit' : 'New'} module</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, key: editing ? form.key : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })} placeholder="Module name" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <input required value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="key-slug" disabled={!!editing} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm disabled:bg-gray-50" />
                </div>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="Icon name (lucide)" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <input type="number" value={form.menuPosition} onChange={(e) => setForm({ ...form, menuPosition: e.target.value })} placeholder="Menu position" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">Accessible roles</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_ROLES.map((r) => {
                      const selected = form.roles.includes(r);
                      return (
                        <button key={r} type="button" onClick={() => setForm({ ...form, roles: selected ? form.roles.filter((x) => x !== r) : [...form.roles, r] })}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'}`}>
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-600">Departments</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(departments ?? []).map((d: any) => {
                      const selected = form.departmentIds.includes(d.id);
                      return (
                        <button key={d.id} type="button" onClick={() => setForm({ ...form, departmentIds: selected ? form.departmentIds.filter((x) => x !== d.id) : [...form.departmentIds, d.id] })}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600'}`}>
                          {d.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {error && <p className="text-xs text-rose-600">{error}</p>}
                <div className="flex gap-3">
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
