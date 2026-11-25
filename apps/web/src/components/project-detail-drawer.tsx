'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { X, Calendar, Users, TrendingUp, UserPlus, Wand2, Check } from 'lucide-react';
import { fullName, initials, fmtDate } from '@/lib/format';
import { SlimProgressBar } from './team-progress-overview';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
];

function taskProgress(status?: string | null): number {
  switch (status) {
    case 'completed':
    case 'approved':
      return 100;
    case 'in_review':
      return 80;
    case 'in_progress':
    case 'changes_requested':
      return 50;
    default:
      return 0;
  }
}

/** Slide-over project detail view: live progress, team, and every project task with inline controls. */
export function ProjectDetailDrawer({
  project,
  tasks,
  assignableUsers,
  canManage,
  onClose,
  onChanged,
}: {
  project: any;
  tasks: any[];
  assignableUsers: any[];
  canManage: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    onChanged?.();
  };

  const unassigned = tasks.filter((t) => !(t.assignees?.length)).length;

  const stats = useMemo(() => {
    const active = tasks.filter((t) => !['completed', 'approved', 'cancelled'].includes(t.status));
    const weighted = tasks.reduce((s, t) => s + taskProgress(t.status), 0);
    const done = tasks.filter((t) => ['completed', 'approved'].includes(t.status)).length;
    return {
      pct: tasks.length ? Math.round(weighted / tasks.length) : 0,
      done,
      total: tasks.length,
      active: active.length,
    };
  }, [tasks]);

  const memberIds = new Set((project.members ?? []).map((m: any) => m.userId ?? m.user?.id));
  const addCandidates = assignableUsers.filter((u) => u.isActive !== false && !memberIds.has(u.id));

  const autoAssign = useMutation({
    mutationFn: () => api.post(`/projects/${project.id}/auto-assign`).then((r) => r.data),
    onSuccess: refresh,
    onError: (e: any) => setError(e.response?.data?.message || 'Auto-assign failed'),
  });

  const addMember = useMutation({
    mutationFn: (userId: string) => api.post(`/projects/${project.id}/members`, { userId }).then((r) => r.data),
    onSuccess: () => { refresh(); setAddOpen(false); },
    onError: (e: any) => setError(e.response?.data?.message || 'Could not add member'),
  });

  const setStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.post(`/tasks/${taskId}/status`, { status }).then((r) => r.data),
    onSuccess: refresh,
    onError: (e: any) => setError(e.response?.data?.message || 'Status update failed'),
  });

  const setAssignee = useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string }) =>
      api.put(`/tasks/${taskId}`, { assigneeIds: [userId] }).then((r) => r.data),
    onSuccess: refresh,
    onError: (e: any) => setError(e.response?.data?.message || 'Assignee update failed'),
  });

  const members = project.members ?? [];

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-gray-900">{project.name}</h2>
                <StatusBadge status={project.status} />
                <PriorityBadge priority={project.priority} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <Calendar className="h-3.5 w-3.5" />
                {project.deadline ? `Deadline ${fmtDate(project.deadline)}` : 'No deadline'}
                {project.projectType === 'recurring' && ` · Cycle ${project.currentCycle ?? 1}`}
              </p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3">
            <SlimProgressBar percent={stats.pct} done={stats.done} total={stats.total} />
          </div>

          {/* Team row + controls */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex -space-x-2">
              {members.slice(0, 6).map((m: any) => {
                const u = m.user ?? m;
                return (
                  <span
                    key={u.id}
                    title={fullName(u)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700 ring-2 ring-white"
                  >
                    {initials(u.firstName, u.lastName)}
                  </span>
                );
              })}
            </div>
            <span className="text-xs font-medium text-gray-500">{members.length} member{members.length === 1 ? '' : 's'}</span>
            {canManage && (
              <div className="relative ml-auto flex items-center gap-1.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAddOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
                  >
                    <UserPlus className="h-3 w-3" /> Add
                  </button>
                  {addOpen && (
                    <div className="absolute right-0 top-8 z-10 max-h-56 w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                      {addCandidates.length === 0 && <p className="px-3 py-2 text-[11px] text-gray-400">Everyone is already on this project</p>}
                      {addCandidates.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          disabled={addMember.isPending}
                          onClick={() => addMember.mutate(u.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-gray-700 hover:bg-emerald-50"
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700">
                            {initials(u.firstName, u.lastName)}
                          </span>
                          {fullName(u)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {unassigned > 0 && (
                  <button
                    type="button"
                    disabled={autoAssign.isPending}
                    onClick={() => autoAssign.mutate()}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Wand2 className="h-3 w-3" /> Auto-Assign ({unassigned})
                  </button>
                )}
              </div>
            )}
          </div>
          {error && <p className="mt-2 text-[11px] font-medium text-rose-600">{error}</p>}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Project Tasks · {stats.active} active · {stats.done} done
            </p>
          </div>
          {tasks.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No tasks generated for this project yet</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t: any) => {
                const pct = taskProgress(t.status);
                return (
                  <Card key={t.id} className="card-premium">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-gray-900">{t.title}</p>
                          <p className="mt-0.5 text-[10px] text-gray-400">
                            {t.taskNumber ?? ''}{t.dayOffset ? ` · Day ${t.dayOffset}` : ''}{t.deadline ? ` · ${fmtDate(t.deadline)}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] font-bold tabular-nums text-emerald-600">{pct}%</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {/* Status dropdown */}
                        {canManage ? (
                          <select
                            value={['todo', 'in_progress', 'in_review', 'completed'].includes(t.status) ? t.status : 'todo'}
                            disabled={setStatus.isPending}
                            onChange={(e) => setStatus.mutate({ taskId: t.id, status: e.target.value })}
                            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          >
                            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            {!['todo', 'in_progress', 'in_review', 'completed'].includes(t.status) && (
                              <option value={t.status}>{t.status.replace(/_/g, ' ')}</option>
                            )}
                          </select>
                        ) : (
                          <StatusBadge status={t.status} />
                        )}
                        {/* Assignee selector */}
                        {canManage ? (
                          <select
                            value={t.assignees?.[0]?.userId ?? ''}
                            disabled={setAssignee.isPending}
                            onChange={(e) => e.target.value && setAssignee.mutate({ taskId: t.id, userId: e.target.value })}
                            className="max-w-[160px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          >
                            <option value="">Unassigned</option>
                            {assignableUsers.filter((u) => u.isActive !== false).map((u) => (
                              <option key={u.id} value={u.id}>{fullName(u)}</option>
                            ))}
                          </select>
                        ) : null}
                        {/* Assigned To pill: avatar + readable name */}
                        {(() => {
                          const list: any[] = t.assignees ?? [];
                          if (!list.length) {
                            return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-200">Unassigned</span>;
                          }
                          const u = list[0].user;
                          const extra = list.length - 1;
                          return (
                            <span
                              title={list.map((a: any) => fullName(a.user)).join(', ')}
                              className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
                            >
                              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-200/70 text-[8px] font-bold">
                                {initials(u?.firstName, u?.lastName)}
                              </span>
                              <span className="truncate">{fullName(u)}{extra > 0 ? ` +${extra}` : ''}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
