'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { ReviewActions } from '@/components/task-actions';
import { RemoteTaskControls } from '@/components/remote-task-controls';
import { fmtDate, fullName, initials, isOverdue } from '@/lib/format';
import { FolderKanban, CheckSquare, Send, AlertTriangle, Palette, Clapperboard, Users, UserCheck, TrendingUp, Plus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { StatCard } from '@/components/ui/stat-card';
import { Stagger } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { useManagerDashboardStats } from '@/lib/hooks/dashboard';
import { TeamProgressOverview } from '@/components/team-progress-overview';

const MANAGER_ROLE_NAMES = ['Super Admin', 'Admin', 'Project Manager', 'HR Manager', 'Client'];
const DONE_STATUSES = ['completed', 'approved', 'cancelled'];

/** Stacked progress chart across all projects (Completed / In-Progress / Overdue per project). */
function AllProjectsChart({ tasks, projects }: { tasks: any[]; projects: any[] }) {
  const projectName = (id: string | null) =>
    id ? projects.find((p) => p.id === id)?.name ?? 'Unknown project' : 'Individual tasks';
  const buckets = new Map<string, { name: string; total: number; done: number; active: number; overdue: number }>();
  for (const t of tasks) {
    const key = t.projectId ?? '__none__';
    if (!buckets.has(key)) buckets.set(key, { name: projectName(t.projectId ?? null), total: 0, done: 0, active: 0, overdue: 0 });
    const b = buckets.get(key)!;
    b.total++;
    if (DONE_STATUSES.includes(t.status)) b.done++;
    else if (t.isOverdue || isOverdue(t.deadline, t.status)) b.overdue++;
    else if (['in_progress', 'in_review', 'changes_requested', 'on_hold'].includes(t.status)) b.active++;
  }
  const rows = [...buckets.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 12);
  if (!rows.length) return <p className="py-8 text-center text-sm text-gray-400">No tasks yet</p>;
  const max = Math.max(...rows.map((r) => r.total));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-gray-700 truncate max-w-[60%]">{r.name}</span>
            <span className="text-gray-400">{r.done}/{r.total} done</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="bg-brand-600 progress-fill" style={{ width: `${(r.done / max) * 100}%` }} title={`${r.done} completed`} />
            <div className="bg-brand-300" style={{ width: `${(r.active / max) * 100}%` }} title={`${r.active} in progress`} />
            <div className="bg-rose-500" style={{ width: `${(r.overdue / max) * 100}%` }} title={`${r.overdue} overdue`} />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-4 pt-1 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-600" /> Completed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-300" /> In progress</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Overdue</span>
      </div>
    </div>
  );
}

/** Embedded live view of one employee's dashboard: today queue, carried-over urgent tasks, progress. */
function EmployeeLiveView({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ['tasks', 'employee-view', userId],
    queryFn: () => api.get('/tasks', { params: { assigneeId: userId, limit: 200 } }).then((r) => r.data),
  });
  const tasks: any[] = data?.tasks ?? [];
  const now = new Date();
  const todayStr = now.toDateString();
  const open = tasks.filter((t) => !DONE_STATUSES.includes(t.status));
  const todayTasks = open.filter((t) => t.deadline && new Date(t.deadline).toDateString() === todayStr);
  const carriedOver = open.filter((t) => t.isOverdue || (t.deadline && new Date(t.deadline) < now));
  const completed = tasks.filter((t) => DONE_STATUSES.includes(t.status));
  const avgProgress = open.length ? Math.round(open.reduce((s, t) => s + (t.progress ?? 0), 0) / open.length) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Today's tasks", value: todayTasks.length },
          { label: 'Carried over', value: carriedOver.length, alert: carriedOver.length > 0 },
          { label: 'Open tasks', value: open.length },
          { label: 'Completed', value: completed.length },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border px-3 py-2 text-center ${s.alert ? 'border-rose-200 bg-rose-50' : 'border-gray-100 bg-gray-50/60'}`}>
            <p className={`text-lg font-bold ${s.alert ? 'text-rose-600' : 'text-gray-900'}`}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>
      {open.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Avg progress {avgProgress}%</p>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 progress-fill" style={{ width: `${avgProgress}%` }} />
          </div>
        </div>
      )}
      {carriedOver.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500 mb-1.5">⚠ Carried-over urgent</p>
          <div className="space-y-1.5">
            {carriedOver.slice(0, 5).map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50/40 px-3 py-2 hover:border-rose-300 transition-colors">
                <span className="text-xs font-medium text-gray-800 truncate">{t.title}</span>
                <span className="text-[10px] text-rose-600 shrink-0 ml-2">{t.progress ?? 0}%</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Today&apos;s queue ({todayTasks.length})</p>
        {todayTasks.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">Nothing due today</p>
        ) : (
          <div className="space-y-2">
            {todayTasks.slice(0, 6).map((t) => (
              <div key={t.id} className="rounded-lg border border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/tasks/${t.id}`} className="text-xs font-medium text-gray-800 hover:text-brand-700 truncate">{t.title}</Link>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-1.5">
                  <RemoteTaskControls task={t} readOnly />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManagerDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [selectedEmployee, setSelectedEmployee] = useState('');

  const { data: stats } = useManagerDashboardStats();

  const { data: allTasksData } = useQuery({
    queryKey: ['tasks', 'manager-overview'],
    queryFn: () => api.get('/tasks', { params: { limit: 500 } }).then((r) => r.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const employees = (usersData ?? []).filter(
    (u: any) => u.isActive !== false && !(u.roleNames ?? []).some((r: string) => MANAGER_ROLE_NAMES.includes(r)),
  );

  const { data: reviewQueue } = useQuery({
    queryKey: ['tasks-in-review'],
    queryFn: () => api.get('/tasks', { params: { status: 'in_review', limit: 20 } }).then((r) => r.data),
  });

  const { data: overdueData } = useQuery({
    queryKey: ['tasks-overdue'],
    queryFn: () => api.get('/tasks', { params: { overdue: 'true', limit: 20 } }).then((r) => r.data),
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects', { params: { limit: 100 } }).then((r) => r.data),
  });

  const reviewTasks = reviewQueue?.tasks ?? [];
  const overdueTasks = overdueData?.tasks ?? [];
  const projects = projectsData?.projects ?? [];
  const allTasks = allTasksData?.tasks ?? [];

  const cards = [
    { label: 'Projects', sub: 'All projects', value: stats?.org?.projects ?? 0, delta: stats?.recent?.projects, icon: FolderKanban, href: '/projects', tone: 'green' as const },
    { label: 'Tasks in review', sub: 'Awaiting your review', value: reviewTasks.length, delta: stats?.recent?.inReview, icon: Send, href: '/tasks?status=in_review', tone: 'purple' as const },
    { label: 'Overdue tasks', sub: 'Past due', value: stats?.tasks?.overdue ?? 0, delta: stats?.recent?.overdue, icon: AlertTriangle, href: '/tasks?overdue=true', tone: 'red' as const },
    { label: 'Creative queue', sub: 'In internal review', value: stats?.approvals?.pendingCreatives ?? 0, icon: Palette, href: '/creative', tone: 'pink' as const },
    { label: 'Video queue', sub: 'In internal review', value: stats?.approvals?.pendingVideos ?? 0, icon: Clapperboard, href: '/video', tone: 'violet' as const },
    { label: 'Total tasks', sub: 'Across the org', value: stats?.tasks?.total ?? 0, delta: stats?.recent?.tasks, icon: CheckSquare, href: '/tasks', tone: 'orange' as const },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow={`Welcome back, ${user?.firstName ?? ''}`}
        title="Manager"
        highlight="Dashboard"
        description="Your projects, reviews and team workload."
        actions={
          <button
            type="button"
            onClick={() => router.push('/tasks?create=1')}
            className="gradient-brand-btn flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold whitespace-nowrap lg:hidden"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        }
      />

      <Stagger className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3" stagger={0.07}>
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </Stagger>

      {/* All-projects progress chart + employee dashboard switcher */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="card-premium lg:col-span-3">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-600" /> All projects progress
            </CardTitle>
            <Link href="/projects" className="text-xs font-medium text-brand-600">Manage</Link>
          </CardHeader>
          <CardContent>
            <AllProjectsChart tasks={allTasks} projects={projects} />
          </CardContent>
        </Card>

        <Card className="card-premium lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-brand-600" /> Inspect Employee Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select an employee…</option>
                {employees.map((u: any) => (
                  <option key={u.id} value={u.id}>{fullName(u)} — {u.email}</option>
                ))}
              </select>
            </div>
            {selectedEmployee ? (
              <EmployeeLiveView userId={selectedEmployee} />
            ) : (
              <p className="py-6 text-center text-sm text-gray-400">Pick an employee to see their live dashboard — today&apos;s tasks, carried-over urgent work and remote progress.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live team & project progress analytics */}
      <TeamProgressOverview tasks={allTasks} projects={projects} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Review queue */}
        <Card className="card-premium">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-900">Review queue</CardTitle>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{reviewTasks.length}</span>
          </CardHeader>
          <CardContent className="space-y-3 stagger">
            {reviewTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nothing awaiting review</p>
            ) : (
              reviewTasks.map((task: any) => (
                <div key={task.id} className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 hover:border-brand-200 hover:shadow-md hover:shadow-brand-100 transition-all duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/tasks/${task.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-700">{task.title}</Link>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {task.assignees?.map((a: any) => fullName(a.user)).join(', ')} · due {fmtDate(task.deadline)}
                      </p>
                    </div>
                    <PriorityBadge priority={task.priority} />
                  </div>
                  <div className="mt-3">
                    <ReviewActions task={task} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Overdue + projects */}
        <div className="space-y-6">
          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900">Overdue & blocked</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overdueTasks.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">No overdue tasks 🎉</p>
              ) : (
                overdueTasks.map((task: any) => (
                  <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/30 px-4 py-3 hover:border-rose-300 hover:shadow-md hover:shadow-rose-100 transition-all duration-200">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      <p className="text-xs text-rose-600">Due {fmtDate(task.deadline)} · {task.assignees?.map((a: any) => fullName(a.user)).join(', ')}</p>
                    </div>
                    <StatusBadge status={task.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="card-premium">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold text-gray-900">Your projects</CardTitle>
              <Link href="/projects" className="text-xs font-medium text-brand-600">All projects</Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {projects.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">No projects yet</p>
              ) : (
                projects.slice(0, 4).map((p: any) => (
                  <div key={p.id} className="rounded-xl border border-gray-100 p-3.5 hover:border-brand-200 hover:shadow-md hover:shadow-brand-100/50 transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-600 progress-fill" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="text-[11px] text-gray-500">{p.progress}%</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-gray-400">{p._count?.tasks ?? 0} tasks · due {fmtDate(p.deadline)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
