'use client';

import { useState, useRef, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Search, List, LayoutGrid, X, CalendarDays, MoreVertical, Eye, Pencil, Trash2, UserPlus } from 'lucide-react';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { TaskActions } from '@/components/task-actions';
import { fmtDate, fullName, initials, isOverdue } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { isManager } from '@/lib/roles';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { smartAutoAssignTask, candidateText } from '@/lib/autoAssign';
import { TaskProgressBar } from '@/components/task-progress-bar';
import { TaskProgressOverview } from '@/components/task-progress-overview';
import Link from 'next/link';

const STATUS_COLUMNS = ['todo', 'in_progress', 'in_review', 'changes_requested', 'completed'];
const COLUMN_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  changes_requested: 'Changes',
  completed: 'Completed',
};

function TaskMenu({ task, manager, onEdit, onDelete }: { task: any; manager: boolean; onEdit: (t: any) => void; onDelete: (t: any) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (pos) { setPos(null); return; }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 176;
    const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
    const top = rect.bottom + 4 + 180 > window.innerHeight ? rect.top - 184 : rect.bottom + 4;
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
  };

  const close = () => setPos(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        className="rounded-lg p-1.5 text-gray-500 transition-all duration-150 hover:bg-gray-200 hover:text-gray-800 active:scale-90"
        title="Task actions"
        aria-label="Task actions"
        aria-expanded={!!pos}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {pos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={close} />
          <div
            className="fixed z-[9999] w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-2xl animate-scale-in"
            style={{ top: pos.top, left: pos.left }}
            role="menu"
          >
            <Link href={`/tasks/${task.id}`} onClick={close} className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-gray-700 hover:bg-gray-50">
              <Eye className="h-3.5 w-3.5 text-gray-400" /> View Details
            </Link>
            {manager && (
              <>
                <button type="button" onClick={() => { close(); onEdit(task); }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50">
                  <Pencil className="h-3.5 w-3.5 text-gray-400" /> Edit Task
                </button>
                <button type="button" onClick={() => { close(); onDelete(task); }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-rose-600 hover:bg-rose-50">
                  <Trash2 className="h-3.5 w-3.5" /> Delete Task
                </button>
              </>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function TasksPageInner() {
  const { role, user } = useAuth();
  const manager = isManager(role);
  const searchParams = useSearchParams();
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search);
  const [departmentId, setDepartmentId] = useState('all');
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? 'all');
  const [showCreate, setShowCreate] = useState(searchParams.get('create') === '1');
  const [editing, setEditing] = useState<any>(null);
  const queryClient = useQueryClient();

  const params: any = { limit: 100 };
  if (status !== 'all') params.status = status;
  if (debouncedSearch) params.search = debouncedSearch;
  if (departmentId !== 'all') params.departmentId = departmentId;
  if (projectId !== 'all') params.projectId = projectId;
  if (searchParams.get('overdue') === 'true') params.overdue = 'true';

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', params],
    queryFn: () => api.get(manager ? '/tasks' : '/tasks/my', { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: manager,
  });
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects', { params: { limit: 100 } }).then((r) => r.data),
  });

  const emptyForm = {
    title: '', description: '', priority: 'medium', category: '', status: 'todo',
    departmentId: '', projectId: '', deadline: '', estimatedHours: '',
    requiresApproval: true, clientVisible: false, assigneeIds: [] as string[],
  };
  const [form, setForm] = useState(emptyForm);

  // Live preview of the backend's smart role auto-assign when nothing is picked manually
  const autoSuggestion = useMemo(() => {
    if (form.assigneeIds.length) return null;
    const cands = (users ?? [])
      .filter((u: any) => u.isActive)
      .map((u: any) => ({ id: u.id, name: fullName(u), text: candidateText(u) }));
    return smartAutoAssignTask({ title: form.title, description: form.description, category: form.category }, cands);
  }, [form.assigneeIds, form.title, form.description, form.category, users]);

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const saveTask = useMutation({
    mutationFn: (payload: any) => editing ? api.put(`/tasks/${editing.id}`, payload) : api.post('/tasks', payload),
    onSuccess: () => {
      invalidateTasks();
      closeModal();
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: invalidateTasks,
  });

  const closeModal = () => {
    setShowCreate(false);
    setEditing(null);
    setForm({ ...emptyForm, assigneeIds: [] });
    saveTask.reset();
  };

  const openEdit = (task: any) => {
    setEditing(task);
    setForm({
      title: task.title, description: task.description ?? '', priority: task.priority ?? 'medium',
      category: task.category ?? '', status: task.status ?? 'todo',
      departmentId: task.departmentId ?? task.department?.id ?? '', projectId: task.projectId ?? task.project?.id ?? '',
      deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : '',
      estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : '',
      requiresApproval: task.requiresApproval ?? true, clientVisible: task.clientVisible ?? false,
      assigneeIds: (task.assignees ?? []).map((a: any) => a.userId ?? a.user?.id).filter(Boolean),
    });
    setShowCreate(true);
  };

  const confirmDelete = (task: any) => {
    if (window.confirm(`Delete task "${task.title}" (${task.taskNumber})? This permanently removes it and cannot be undone.`)) {
      deleteTask.mutate(task.id);
    }
  };

  const buildPayload = () => ({
    ...form,
    departmentId: form.departmentId || undefined,
    projectId: form.projectId || undefined,
    deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
    estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined,
    category: form.category || undefined,
  });

  const tasks: any[] = data?.tasks ?? [];

  // Projects with unassigned tasks → one-click auto-assign to the project team
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects?.projects ?? []) map.set(p.id, p.name);
    return map;
  }, [projects]);
  const unassignedByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.projectId && !(t.assignees?.length)) {
        map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1);
      }
    }
    return [...map.entries()];
  }, [tasks]);

  const autoAssign = useMutation({
    mutationFn: (projectId: string) => api.post(`/projects/${projectId}/auto-assign`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return (
    <div className="space-y-5 animate-fade-in-blur">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="animate-fade-in-up">
          <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">{manager ? 'All Tasks' : 'My Tasks'}</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.pagination?.total ?? 0} tasks</p>
        </div>
        <div className="flex items-center gap-2 animate-slide-in-right">
          <div className="flex rounded-xl border border-gray-200 bg-white p-0.5 shadow-sm smooth-transition hover:shadow-md">
            <button onClick={() => setView('list')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 btn-micro ${view === 'list' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button onClick={() => setView('kanban')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 btn-micro ${view === 'kanban' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>
          {manager && (
            <Button onClick={() => { setEditing(null); setForm({ ...emptyForm, assigneeIds: [] }); saveTask.reset(); setShowCreate(true); }} className="gradient-brand-btn text-white border-0 rounded-xl shadow-md shadow-brand-500/25 btn-micro">
              <Plus className="h-4 w-4 mr-1" /> New Task
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="card-premium card-hover-premium animate-scale-in">
        <CardContent className="p-3.5 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search tasks or IDs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50/60 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:bg-white focus:shadow-md focus:shadow-brand-500/10 transition-all duration-200 smooth-transition"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm smooth-transition hover:border-brand-300 focus:ring-2 focus:ring-brand-500/40">
            <option value="all">All statuses</option>
            {Object.entries(COLUMN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="client_review">Client Review</option>
            <option value="on_hold">On Hold</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm smooth-transition hover:border-brand-300 focus:ring-2 focus:ring-brand-500/40">
            <option value="all">All departments</option>
            {(departments ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm smooth-transition hover:border-brand-300 focus:ring-2 focus:ring-brand-500/40">
            <option value="all">All projects</option>
            {(projects?.projects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </CardContent>
      </Card>

      {manager && unassignedByProject.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <UserPlus className="h-4 w-4 text-emerald-600" />
          <p className="text-[13px] font-medium text-emerald-800">Unassigned project tasks detected:</p>
          {unassignedByProject.map(([pid, count]) => (
            <button
              key={pid}
              type="button"
              disabled={autoAssign.isPending}
              onClick={() => autoAssign.mutate(pid)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              Auto-Assign ({count}) to {projectNameById.get(pid) ?? 'Project Team'}
            </button>
          ))}
        </div>
      )}

      {/* Graphical task progress & delivery overview */}
      {!isLoading && tasks.length > 0 && (
        <TaskProgressOverview
          tasks={tasks}
          onSelectStage={(s) => setStatus(s ?? 'all')}
        />
      )}

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>
      ) : view === 'list' ? (
        <Card className="card-premium card-hover-premium animate-scale-in">
          <CardContent className="p-0">
            {/* Mobile stacked cards */}
            <div className="divide-y divide-gray-100 md:hidden">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/tasks/${task.id}`} className="block text-sm font-semibold text-gray-900 hover:text-brand-700">{task.title}</Link>
                    <p className="mt-0.5 text-[11px] text-gray-400">{task.taskNumber}{task.department ? ` · ${task.department.name}` : ''}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={task.status} />
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <div className="mt-2">
                      <TaskProgressBar status={task.status} progress={task.progress} creativeStage={task.creativeStage} compact />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className={isOverdue(task.deadline, task.status) ? 'font-medium text-rose-600' : ''}>
                        <CalendarDays className="mr-1 inline h-3 w-3" />{fmtDate(task.deadline)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {task.assignees.slice(0, 3).map((a: any) => (
                          <span key={a.id} title={fullName(a.user)} className="flex h-6 w-6 items-center justify-center rounded-full gradient-brand text-[8px] font-semibold text-white ring-2 ring-white">
                            {initials(a.user.firstName, a.user.lastName)}
                          </span>
                        ))}
                        {!task.assignees.length && <span className="text-gray-400">Unassigned</span>}
                      </span>
                    </div>
                  </div>
                  <TaskMenu task={task} manager={manager} onEdit={openEdit} onDelete={confirmDelete} />
                </div>
              ))}
              {!tasks.length && (
                <p className="py-12 text-center text-sm text-gray-400">No tasks match your filters</p>
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] stagger-rows">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Task</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Priority</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Assignees</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Due</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Progress</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors smooth-transition">
                      <td className="py-3.5 px-4">
                        <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-gray-900 hover:text-brand-700 smooth-transition">{task.title}</Link>
                        <p className="text-[11px] text-gray-400 mt-0.5">{task.taskNumber} {task.department ? `· ${task.department.name}` : ''}</p>
                      </td>
                      <td className="py-3.5 px-4"><StatusBadge status={task.status} /></td>
                      <td className="py-3.5 px-4"><PriorityBadge priority={task.priority} /></td>
                      <td className="py-3.5 px-4">
                        <div className="flex -space-x-1.5">
                          {task.assignees.slice(0, 3).map((a: any) => (
                            <span key={a.id} title={fullName(a.user)} className="flex h-7 w-7 items-center justify-center rounded-full gradient-brand text-[9px] font-semibold text-white ring-2 ring-white smooth-transition hover:scale-110 hover:z-10">
                              {initials(a.user.firstName, a.user.lastName)}
                            </span>
                          ))}
                          {task.assignees.length > 3 && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[9px] font-semibold text-gray-600 ring-2 ring-white">+{task.assignees.length - 3}</span>}
                          {!task.assignees.length && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className={`py-3.5 px-4 text-sm ${isOverdue(task.deadline, task.status) ? 'text-rose-600 font-medium' : 'text-gray-500'}`}>
                        {fmtDate(task.deadline)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="w-32" title={`Auto progress: ${task.progress}%`}>
                          <TaskProgressBar status={task.status} progress={task.progress} creativeStage={task.creativeStage} compact />
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1">
                          {task.assignees?.some((a: any) => a.userId === user?.id) && <TaskActions task={task} compact />}
                          <TaskMenu task={task} manager={manager} onEdit={openEdit} onDelete={confirmDelete} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!tasks.length && (
                    <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">No tasks match your filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 stagger-fade-in">
          {STATUS_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col);
            return (
              <div key={col} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-card card-hover-premium smooth-transition">
                <div className="flex items-center justify-between px-1.5 pb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{COLUMN_LABELS[col]}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600 smooth-transition hover:bg-brand-50 hover:text-brand-600">{colTasks.length}</span>
                </div>
                <div className="space-y-2.5 min-h-[80px]">
                  {colTasks.map((task) => (
                    <div key={task.id} className="group relative rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-gray-200/70 hover:ring-brand-300 hover:shadow-lg hover:shadow-brand-100/60 hover:-translate-y-1 transition-all duration-200 animate-fade-in-up smooth-transition">
                      <Link href={`/tasks/${task.id}`} className="block">
                        <p className="text-[13px] font-semibold text-gray-900 leading-snug pr-6">{task.title}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{task.taskNumber}</p>
                        <div className="mt-2.5 flex items-center justify-between">
                          <PriorityBadge priority={task.priority} />
                          <div className="flex -space-x-1.5">
                            {task.assignees.slice(0, 2).map((a: any) => (
                              <span key={a.id} className="flex h-6 w-6 items-center justify-center rounded-full gradient-brand text-[8px] font-semibold text-white ring-2 ring-white smooth-transition hover:scale-110 hover:z-10">
                                {initials(a.user.firstName, a.user.lastName)}
                              </span>
                            ))}
                          </div>
                        </div>
                        {task.deadline && (
                          <p className={`mt-2 flex items-center gap-1 text-[11px] ${isOverdue(task.deadline, task.status) ? 'text-rose-600 font-medium' : 'text-gray-400'}`}>
                            <CalendarDays className="h-3 w-3" /> {fmtDate(task.deadline)}
                          </p>
                        )}
                        <div className="mt-2.5">
                          <TaskProgressBar status={task.status} progress={task.progress} creativeStage={task.creativeStage} compact />
                        </div>
                      </Link>
                      <div className="absolute right-2 top-2 rounded-lg bg-white/90 opacity-70 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <TaskMenu task={task} manager={manager} onEdit={openEdit} onDelete={confirmDelete} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal — portaled to body so page transforms can't clip it */}
      {showCreate && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-[2px] animate-fade-in sm:p-6" onClick={closeModal}>
          <Card className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[650px] flex-col animate-scale-in shadow-2xl sm:max-h-[calc(100dvh-3rem)]" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-5">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? `Edit task — ${editing.taskNumber}` : 'Create task'}</h2>
              <button onClick={closeModal} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 hover:rotate-90"><X className="h-5 w-5" /></button>
            </div>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 pt-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveTask.mutate(buildPayload());
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description / brief" rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Priority</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
                    <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. design" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  {editing && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                        {Object.entries(COLUMN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        <option value="on_hold">On Hold</option>
                        <option value="approved">Approved</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Department</label>
                    <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="">None</option>
                      {(departments ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Project</label>
                    <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="">None</option>
                      {(projects?.projects ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Deadline</label>
                    <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Est. hours</label>
                    <input type="number" min={0} value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-600">
                    <span>Assign to</span>
                    {!form.assigneeIds.length && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        ✨ Auto-Assign by Role (Recommended)
                      </span>
                    )}
                  </label>
                  {autoSuggestion && !form.assigneeIds.length && (
                    <p className="mb-2 text-[11px] font-medium text-emerald-700">
                      Will auto-assign to <span className="font-semibold">{autoSuggestion.candidate.name}</span> ({autoSuggestion.role})
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {(users ?? []).filter((u: any) => u.isActive).map((u: any) => {
                      const selected = form.assigneeIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setForm({ ...form, assigneeIds: selected ? form.assigneeIds.filter((id) => id !== u.id) : [...form.assigneeIds, u.id] })}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 ${selected ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm shadow-brand-200' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
                        >
                          {fullName(u)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
                  <span className="text-sm text-gray-700">Requires manager approval before completion</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={form.clientVisible} onChange={(e) => setForm({ ...form, clientVisible: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
                  <span className="text-sm text-gray-700">Show task updates in the client portal</span>
                </label>
                </div>
                <div className="shrink-0 space-y-2 border-t border-gray-100 pt-3">
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={closeModal}>Cancel</Button>
                    <Button type="submit" disabled={saveTask.isPending} className="flex-1 gradient-brand-btn text-white border-0 rounded-xl">
                      {saveTask.isPending ? (editing ? 'Saving...' : 'Creating...') : (editing ? 'Save changes' : 'Create task')}
                    </Button>
                  </div>
                  {saveTask.isError && <p className="text-xs text-rose-600">{(saveTask.error as any)?.response?.data?.message || `Failed to ${editing ? 'update' : 'create'} task`}</p>}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="flex h-96 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>}>
      <TasksPageInner />
    </Suspense>
  );
}
