'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { fullName, initials, fmtDate, timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { ProjectVelocityOverview } from '@/components/project-velocity-overview';
import { ProjectDetailDrawer } from '@/components/project-detail-drawer';
import { SlimProgressBar, buildProjectStats } from '@/components/team-progress-overview';
import { FolderKanban, Lock, Send, ShieldCheck, Search, Loader2 } from 'lucide-react';

const DONE_STATUSES = ['completed', 'approved'];
const ACTIVE_STATUSES = ['todo', 'in_progress', 'in_review', 'changes_requested', 'pending'];
const STATUS_ORDER: Record<string, number> = { in_progress: 0, in_review: 1, todo: 2, pending: 3, changes_requested: 4, completed: 5, approved: 6, cancelled: 7 };

function taskProgress(status?: string | null): number {
  switch (status) {
    case 'completed': case 'approved': return 100;
    case 'in_review': case 'submitted': return 80;
    case 'in_progress': case 'changes_requested': return 50;
    default: return 0;
  }
}

function AssigneePill({ task }: { task: any }) {
  const list: any[] = task?.assignees ?? [];
  if (!list.length) {
    return <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 ring-1 ring-slate-200">Unassigned</span>;
  }
  const u = list[0]?.user;
  const role = u?.employeeProfile?.designation ?? u?.roleNames?.[0] ?? u?.roles?.[0]?.role?.name;
  const extra = list.length - 1;
  const names = list.map((a: any) => fullName(a.user)).join(', ');
  return (
    <span
      title={`${names}${role ? ` • ${role}` : ''}`}
      className="inline-flex max-w-[110px] shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-200/70 text-[7px] font-bold">
        {initials(u?.firstName, u?.lastName)}
      </span>
      <span className="truncate">{(u?.firstName || '').split(' ')[0] || fullName(u)}{extra > 0 ? ` +${extra}` : ''}</span>
    </span>
  );
}

/** Locked / pending / approved gate + the full Projects module for the HR dashboard. */
export function HrProjectsAccess() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(user?.projectAccessStatus ?? null);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [taskProject, setTaskProject] = useState<any>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setStatus(user?.projectAccessStatus ?? null);
  }, [user?.projectAccessStatus]);

  const request = useMutation({
    mutationFn: () => api.post('/users/me/project-access-request', { reason: reason.trim() || undefined }).then((r) => r.data),
    onSuccess: (d: any) => {
      setStatus(d?.projectAccessStatus ?? 'pending');
      setRequestedAt(new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });

  const approved = status === 'approved';

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then((r) => r.data),
    enabled: approved,
  });
  const { data: tasksData } = useQuery({
    queryKey: ['tasks', 'progress-overview'],
    queryFn: () => api.get('/tasks', { params: { limit: 500 } }).then((r) => r.data),
    enabled: approved,
  });
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: approved,
  });

  const projects = projectsData?.projects ?? [];
  const allTasks: any[] = tasksData?.tasks ?? [];
  const usersById = useMemo(() => {
    const m = new Map<string, any>();
    for (const u of usersData ?? []) m.set(u.id, u);
    return m;
  }, [usersData]);

  const projectStats = useMemo(() => buildProjectStats(allTasks, projects), [allTasks, projects]);
  const statById = useMemo(() => new Map(projectStats.map((s) => [s.projectId, s])), [projectStats]);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of allTasks) {
      if (!t.projectId) continue;
      const arr = map.get(t.projectId) ?? [];
      arr.push(t);
      map.set(t.projectId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (a.dayOffset ?? 999) - (b.dayOffset ?? 999));
    }
    return map;
  }, [allTasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p: any) => (p.name ?? '').toLowerCase().includes(q));
  }, [projects, search]);

  /* ---------- Locked / pending / rejected states ---------- */
  if (!approved) {
    return (
      <Card className="card-premium overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <FolderKanban className="h-4 w-4 text-brand-600" /> Projects &amp; Delivery Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'pending' ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Pending Super Admin Approval</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Your request{requestedAt ? ` sent ${timeAgo(requestedAt)}` : ''} is awaiting review. The Projects section unlocks automatically once approved.
                </p>
              </div>
            </div>
          ) : status === 'rejected' ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                <div>
                  <p className="text-sm font-semibold text-rose-800">Access request declined by Admin</p>
                  <p className="mt-0.5 text-xs text-rose-600">You can submit a new request below.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for re-request (optional)"
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <Button onClick={() => request.mutate()} disabled={request.isPending} className="gradient-brand-btn rounded-xl text-white">
                  <Send className="mr-1.5 h-4 w-4" /> Request Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Project visibility requires Super Admin authorization</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Request access to view live project progress, sprint velocity, team workload and task distribution on your HR Dashboard.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Need project & workload visibility for team capacity planning"
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <Button onClick={() => request.mutate()} disabled={request.isPending} className="gradient-brand-btn rounded-xl text-white">
                  {request.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Request Admin Approval to View Projects
                </Button>
              </div>
              {request.isError && <p className="text-xs font-medium text-rose-600">Request failed — please try again.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ---------- Approved: full Projects module ---------- */
  return (
    <div className="space-y-5">
      <ProjectVelocityOverview />

      <Card className="card-premium">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <FolderKanban className="h-4 w-4 text-brand-600" /> Projects &amp; Delivery Overview
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Admin approved</span>
          </CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50/60 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No projects found.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((project: any) => {
                const cardTasks = tasksByProject.get(project.id) ?? [];
                const preview = cardTasks.slice(0, 3);
                const stat = statById.get(project.id);
                const progress = stat?.progress ?? 0;
                const totalTasks = project._count?.tasks ?? cardTasks.length;
                const doneTasks = cardTasks.filter((t: any) => DONE_STATUSES.includes(t.status)).length;
                const activeTasks = cardTasks.filter((t: any) => ACTIVE_STATUSES.includes(t.status)).length;
                const todoTasks = cardTasks.length - doneTasks - activeTasks;
                const members = project.members ?? [];
                return (
                  <Card
                    key={project.id}
                    onClick={() => setTaskProject(project)}
                    className="card-premium cursor-pointer transition hover:shadow-lg hover:shadow-gray-200/60"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="truncate text-sm font-semibold text-gray-900">{project.name}</h3>
                            <StatusBadge status={project.status} />
                            <PriorityBadge priority={project.priority} />
                          </div>
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            {project.service ? `${project.service.toUpperCase()} · ` : ''}
                            {project.projectType === 'recurring' ? '🔁 Recurring' : '📌 One-Time'}
                          </p>
                        </div>
                        {project.manager && (
                          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-200/70 text-[7px] font-bold">
                              {initials(project.manager.firstName, project.manager.lastName)}
                            </span>
                            {project.manager.firstName}
                          </span>
                        )}
                      </div>

                      <div className="mt-3.5">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-500">Progress</span>
                          <span className="font-semibold text-gray-900">{progress}%</span>
                        </div>
                        <SlimProgressBar percent={progress} />
                      </div>

                      <div className="mt-3">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Project Tasks</p>
                        <div className="space-y-1">
                          {preview.length === 0 && <p className="text-[11px] text-gray-400">No tasks yet</p>}
                          {preview.map((t: any) => (
                            <div key={t.id} className="flex items-center gap-2 rounded-md bg-gray-50/70 px-2 py-1.5">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DONE_STATUSES.includes(t.status) ? 'bg-emerald-500' : ACTIVE_STATUSES.includes(t.status) ? 'bg-amber-500' : 'bg-slate-300'}`} />
                              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-700">{t.title}</span>
                              <AssigneePill task={t} />
                              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${DONE_STATUSES.includes(t.status) ? 'bg-emerald-50 text-emerald-700' : ACTIVE_STATUSES.includes(t.status) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                {t.status === 'in_progress' ? 'In Progress' : t.status === 'in_review' ? 'In Review' : DONE_STATUSES.includes(t.status) ? 'Completed' : 'To Do'}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[10px] text-gray-400">
                          {doneTasks} Done • {activeTasks} Active • {todoTasks} To Do
                          {cardTasks.length > 3 ? ` · +${cardTasks.length - 3} more` : ''}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="flex -space-x-1">
                            {members.slice(0, 4).map((m: any) => {
                              const u = m.user ?? usersById.get(m.userId);
                              if (!u) return null;
                              return (
                                <span key={m.id ?? m.userId} className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-bold text-emerald-700 ring-2 ring-white">
                                  {initials(u.firstName, u.lastName)}
                                </span>
                              );
                            })}
                          </span>
                          <span className="truncate">
                            {members.slice(0, 2).map((m: any) => fullName(m.user ?? usersById.get(m.userId))).filter(Boolean).join(', ')}
                            {members.length > 2 ? ` +${members.length - 2}` : ''} • {members.length} members
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-gray-400">
                          <span>📅</span> {fmtDate(project.endDate)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setTaskProject(project); }}
                        className="mt-1 block w-full pt-1 text-center text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        View project tasks ({totalTasks}) →
                      </button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {taskProject && (
        <ProjectDetailDrawer
          project={taskProject}
          tasks={tasksByProject.get(taskProject.id) ?? []}
          assignableUsers={usersData ?? []}
          canManage={false}
          onClose={() => setTaskProject(null)}
        />
      )}
    </div>
  );
}
