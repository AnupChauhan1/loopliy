'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Search, X, Loader2, Trash2, ClipboardList, AlertTriangle } from 'lucide-react';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { TaskActions } from '@/components/task-actions';
import { fmtDate, fullName, initials, isOverdue } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { isManager } from '@/lib/roles';
import { dueDateFor, fmtShortDate, todayInputValue } from '@/lib/smm-template';
import { useToast, errorMessage } from '@/components/ui/toast';

const emptyForm = {
  title: '',
  description: '',
  priority: 'medium',
  startDate: todayInputValue(),
  dayOffset: 1,
  requiresApproval: true,
  assigneeIds: [] as string[],
};

export default function IndividualTasksPage() {
  const { role, user } = useAuth();
  const manager = isManager(role);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'individual', search],
    queryFn: () =>
      api.get('/tasks', { params: { individual: 'true', limit: 100, ...(search ? { search } : {}) } }).then((r) => r.data),
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: manager,
  });

  const createTask = useMutation({
    mutationFn: (payload: any) => api.post('/tasks', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowCreate(false);
      setForm({ ...emptyForm, assigneeIds: [] });
      setFormError('');
      toast.success('Task created', 'Standalone task assigned.');
    },
    onError: (e: any) => setFormError(errorMessage(e)),
  });

  const tasks: any[] = data?.tasks ?? [];
  const assignees = (users ?? []).filter((u: any) => u.isActive !== false);

  if (!manager) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-400">Individual task management is available to managers and admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-brand-600" /> Individual Tasks
          </h1>
          <p className="text-sm text-gray-500 mt-1">Standalone non-project tasks — same urgent alarms & overdue escalation apply.</p>
        </div>
        <Button onClick={() => { setForm({ ...emptyForm, assigneeIds: [] }); setFormError(''); setShowCreate(true); }} className="gradient-brand-btn text-white border-0 rounded-xl shadow-md shadow-brand-500/25">
          <Plus className="h-4 w-4 mr-1" /> New Individual Task
        </Button>
      </div>

      <Card className="card-premium">
        <CardContent className="p-3.5">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search individual tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50/60 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>
      ) : tasks.length === 0 ? (
        <Card className="card-premium">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-8 w-8 text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No individual tasks yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 stagger">
          {tasks.map((task) => (
            <Card key={task.id} className="card-premium">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{task.taskNumber}{task.dayOffset ? ` · Day ${task.dayOffset}` : ''}</p>
                  </div>
                  <PriorityBadge priority={task.priority} />
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <StatusBadge status={task.status} />
                  {task.isOverdue && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-rose-600 rounded-full px-2 py-0.5">
                      <AlertTriangle className="h-3 w-3" /> carried over
                    </span>
                  )}
                </div>
                <p className={`text-xs mt-2 ${isOverdue(task.deadline, task.status) ? 'text-rose-600 font-medium' : 'text-gray-500'}`}>
                  Due {fmtDate(task.deadline)}
                </p>
                <div className="mt-2 flex -space-x-1.5">
                  {(task.assignees ?? []).slice(0, 3).map((a: any) => (
                    <span key={a.id} title={fullName(a.user)} className="flex h-7 w-7 items-center justify-center rounded-full gradient-brand text-[9px] font-semibold text-white ring-2 ring-white">
                      {initials(a.user?.firstName, a.user?.lastName)}
                    </span>
                  ))}
                  {(task.assignees ?? []).length === 0 && <span className="text-xs text-gray-400">Unassigned</span>}
                </div>
                <div className="mt-3">
                  <TaskActions task={task} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] animate-fade-in" onClick={() => setShowCreate(false)}>
          <Card className="w-full max-w-lg animate-scale-in shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold text-gray-900">New Individual Task</h2>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <CardContent className="space-y-4 px-6 pb-6">
              {formError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{formError}</div>}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Day Offset</label>
                  <input
                    type="number"
                    min={1}
                    value={form.dayOffset}
                    onChange={(e) => setForm({ ...form, dayOffset: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Due {form.dayOffset > 0 ? fmtShortDate(dueDateFor(form.startDate, form.dayOffset)) : '—'} (auto-computed)
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Priority / Alarm</label>
                <div className="flex gap-2">
                  {(['medium', 'urgent'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm({ ...form, priority: p })}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${form.priority === p ? (p === 'urgent' ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-brand-500 bg-brand-50 text-brand-700') : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                    >
                      {p === 'urgent' ? '🚨 Urgent alarm' : 'Normal'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Assign To</label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                  {assignees.map((u: any) => (
                    <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.assigneeIds.includes(u.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            assigneeIds: e.target.checked ? [...form.assigneeIds, u.id] : form.assigneeIds.filter((id) => id !== u.id),
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-brand-600"
                      />
                      <span className="text-sm text-gray-700">{fullName(u)}</span>
                      <span className="text-[11px] text-gray-400">{u.email}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.requiresApproval}
                  onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                Requires manager approval before completion
              </label>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Button>
                <Button
                  onClick={() => {
                    setFormError('');
                    if (!form.title.trim()) { setFormError('Title is required'); return; }
                    if (!form.assigneeIds.length) { setFormError('Assign at least one employee'); return; }
                    createTask.mutate({
                      title: form.title,
                      description: form.description || undefined,
                      priority: form.priority,
                      requiresApproval: form.requiresApproval,
                      startDate: new Date(`${form.startDate}T00:00:00`).toISOString(),
                      dayOffset: form.dayOffset,
                      isIndividual: true,
                      assigneeIds: form.assigneeIds,
                    });
                  }}
                  disabled={createTask.isPending}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white"
                >
                  {createTask.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : 'Create Task'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
