'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fullName, initials } from '@/lib/format';
import { TrendingUp } from 'lucide-react';

const DONE_STATUSES = ['completed', 'approved'];
const NON_EMPLOYEE_ROLES = ['Super Admin', 'Admin', 'Project Manager', 'HR Manager', 'Client'];
const DAY_COUNT = 24;

/** Status → automatic progress % (mirrors the API rule: 0 / 50 / 80 / 100). */
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

export interface EmployeeStat {
  userId: string;
  name: string;
  done: number;
  total: number;
  pct: number;
}

export interface ProjectStat {
  projectId: string;
  name: string;
  status: string;
  deadline?: string | null;
  startDate?: string | null;
  progress: number;
  done: number;
  total: number;
}

/** Completion stats per assignee: done = completed/approved, total = non-cancelled tasks. */
export function buildEmployeeStats(tasks: any[]): EmployeeStat[] {
  const map = new Map<string, EmployeeStat>();
  for (const t of tasks ?? []) {
    if (t.status === 'cancelled') continue;
    for (const a of t.assignees ?? []) {
      const userId = a.userId ?? a.user?.id;
      if (!userId) continue;
      if (!map.has(userId)) {
        map.set(userId, {
          userId,
          name: fullName(a.user) || a.user?.email || 'Unknown',
          done: 0,
          total: 0,
          pct: 0,
        });
      }
      const s = map.get(userId)!;
      s.total++;
      if (DONE_STATUSES.includes(t.status)) s.done++;
    }
  }
  const rows = [...map.values()].filter((s) => s.total > 0);
  for (const s of rows) s.pct = Math.round((s.done / s.total) * 100);
  return rows.sort((a, b) => b.pct - a.pct || b.total - a.total);
}

/** Per-project done/total counts plus the backend's auto-calculated progress. */
export function buildProjectStats(tasks: any[], projects: any[]): ProjectStat[] {
  const counts = new Map<string, { done: number; total: number }>();
  for (const t of tasks ?? []) {
    if (!t.projectId || t.status === 'cancelled') continue;
    if (!counts.has(t.projectId)) counts.set(t.projectId, { done: 0, total: 0 });
    const c = counts.get(t.projectId)!;
    c.total++;
    if (DONE_STATUSES.includes(t.status)) c.done++;
  }
  return (projects ?? [])
    .filter((p) => (counts.get(p.id)?.total ?? 0) > 0 || p.status === 'active')
    .map((p) => {
      const c = counts.get(p.id) ?? { done: 0, total: 0 };
      return {
        projectId: p.id,
        name: p.name,
        status: p.status,
        deadline: p.deadline,
        startDate: p.startDate,
        progress: p.progress ?? 0,
        done: c.done,
        total: c.total,
      };
    })
    .sort((a, b) => b.progress - a.progress || b.total - a.total);
}

/** Effective schedule day (1–24) for a task: explicit dayOffset, else derived from deadline vs project start. */
function taskDay(t: any, startByProject: Map<string, number>): number {
  const clamp = (d: number) => Math.min(DAY_COUNT, Math.max(1, Math.round(d)));
  if (typeof t.dayOffset === 'number' && t.dayOffset > 0) return clamp(t.dayOffset);
  const start = t.projectId ? startByProject.get(t.projectId) : undefined;
  if (t.deadline && start) {
    const diff = Math.floor((new Date(t.deadline).getTime() - start) / 86_400_000) + 1;
    if (diff >= 1 && diff <= DAY_COUNT * 2) return clamp(diff);
  }
  return DAY_COUNT;
}

interface DayPoint {
  day: number;
  label: string;
  target: number;
  pct: number;
  done: number;
  total: number;
}

/** 24-day series: planned target ramp + cumulative actual auto-progress for a scope. */
function buildDaySeries(tasks: any[], projectId: string | null, startByProject: Map<string, number>): DayPoint[] {
  const scoped = (tasks ?? []).filter(
    (t) => t.status !== 'cancelled' && (projectId === null ? !!t.projectId : t.projectId === projectId),
  );
  const byDay = new Map<number, any[]>();
  for (const t of scoped) {
    const d = taskDay(t, startByProject);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(t);
  }
  const points: DayPoint[] = [];
  let weighted = 0;
  let done = 0;
  let total = 0;
  for (let d = 1; d <= DAY_COUNT; d++) {
    for (const t of byDay.get(d) ?? []) {
      weighted += taskProgress(t.status);
      total++;
      if (DONE_STATUSES.includes(t.status)) done++;
    }
    points.push({
      day: d,
      label: `Day ${d}`,
      target: Math.round((d / DAY_COUNT) * 100),
      pct: total ? Math.round(weighted / total) : 0,
      done,
      total,
    });
  }
  return points;
}

/** Fetches tasks + projects + users once (shared react-query cache) for progress analytics. */
export function useProgressData(enabled = true) {
  const tasks = useQuery({
    queryKey: ['tasks', 'progress-overview'],
    queryFn: () => api.get('/tasks', { params: { limit: 500 } }).then((r) => r.data),
    enabled,
  });
  const projects = useQuery({
    queryKey: ['projects', 'progress-overview'],
    queryFn: () => api.get('/projects', { params: { limit: 100 } }).then((r) => r.data),
    enabled,
  });
  const users = useQuery({
    queryKey: ['users', 'progress-overview'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled,
  });
  return {
    tasks: tasks.data?.tasks ?? [],
    projects: projects.data?.projects ?? [],
    users: users.data ?? [],
    isLoading: tasks.isLoading || projects.isLoading,
  };
}

function WaveTooltip({ active, payload, label, scopeName }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as DayPoint | undefined;
  if (!p) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-gray-950/90 px-3.5 py-2.5 text-white shadow-2xl backdrop-blur-xl">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{scopeName} · {label}</p>
      <p className="mt-1 text-sm font-bold text-emerald-400 tabular-nums">{p.pct}% complete</p>
      <p className="text-xs text-gray-300">{p.done}/{p.total} tasks done</p>
      <p className="text-[11px] text-gray-500">Target {p.target}%</p>
    </div>
  );
}

function ProjectWaveChart({ data, scopeName }: { data: DayPoint[]; scopeName: string }) {
  return (
    <div className="h-44 w-full min-w-0 sm:h-52">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id="proj-wave-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: '#94A3B8' }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            width={36}
            unit="%"
          />
          <Tooltip content={<WaveTooltip scopeName={scopeName} />} cursor={{ stroke: '#059669', strokeOpacity: 0.3, strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey="target"
            stroke="#94A3B8"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            fill="none"
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="pct"
            stroke="#059669"
            strokeWidth={2.5}
            fill="url(#proj-wave-fill)"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#059669' }}
            animationDuration={600}
            animationEasing="ease-out"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const STATUS_SEGMENTS = [
  { key: 'completed', label: 'Completed', dot: 'bg-emerald-500', match: (s: string) => DONE_STATUSES.includes(s) },
  { key: 'in_progress', label: 'In Progress', dot: 'bg-sky-500', match: (s: string) => s === 'in_progress' || s === 'changes_requested' },
  { key: 'in_review', label: 'In Review', dot: 'bg-amber-500', match: (s: string) => s === 'in_review' },
  { key: 'todo', label: 'To Do', dot: 'bg-slate-400', match: (s: string) => s === 'todo' || s === 'on_hold' },
] as const;

/** Live "Team & Project Progress Overview" — rich multi-metric SaaS analytics card. */
export function TeamProgressOverview({ tasks, projects, users }: { tasks?: any[]; projects?: any[]; users?: any[] }) {
  const needFetch = tasks === undefined || projects === undefined || users === undefined;
  const fetched = useProgressData(needFetch);
  const taskList = tasks ?? fetched.tasks;
  const projectList = projects ?? fetched.projects;
  const userList = users ?? fetched.users;

  const [scope, setScope] = useState<string>('all');
  const [showAllEmployees, setShowAllEmployees] = useState(false);

  const statMap = useMemo(() => {
    const map = new Map(buildEmployeeStats(taskList).map((s) => [s.userId, s]));
    return map;
  }, [taskList]);

  // Active employees: everyone on the user list without a lead/client role; fall back to assignees.
  const employees = useMemo<EmployeeStat[]>(() => {
    const staff: any[] = (userList ?? []).filter(
      (u: any) => u.isActive !== false && !(u.roleNames ?? []).some((r: string) => NON_EMPLOYEE_ROLES.includes(r)),
    );
    if (!staff.length) return buildEmployeeStats(taskList).slice(0, 15);
    return staff
      .map((u: any) => statMap.get(u.id) ?? { userId: u.id, name: fullName(u) || u.email, done: 0, total: 0, pct: 0 })
      .sort((a: EmployeeStat, b: EmployeeStat) => b.pct - a.pct || a.name.localeCompare(b.name));
  }, [userList, statMap, taskList]);

  const projectStats = useMemo(() => buildProjectStats(taskList, projectList), [taskList, projectList]);
  const startByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projectStats) {
      if (p.startDate) map.set(p.projectId, new Date(p.startDate).getTime());
    }
    return map;
  }, [projectStats]);

  const scopeProject = projectStats.find((p) => p.projectId === scope) ?? null;
  const scopeName = scopeProject?.name ?? 'All Projects';
  const scopePct = scopeProject ? scopeProject.progress : projectStats.length
    ? Math.round(projectStats.reduce((s, p) => s + p.progress, 0) / projectStats.length)
    : 0;
  const waveData = useMemo(
    () => buildDaySeries(taskList, scopeProject ? scopeProject.projectId : null, startByProject),
    [taskList, scopeProject, startByProject],
  );

  // KPI pills
  const teamAvg = employees.length ? Math.round(employees.reduce((s, e) => s + e.pct, 0) / employees.length) : 0;
  const totals = useMemo(() => {
    let done = 0;
    let total = 0;
    const seg = { completed: 0, in_progress: 0, in_review: 0, todo: 0 };
    for (const t of taskList ?? []) {
      if (t.status === 'cancelled') continue;
      total++;
      if (DONE_STATUSES.includes(t.status)) done++;
      for (const s of STATUS_SEGMENTS) {
        if (s.match(t.status)) {
          if (s.key === 'completed') seg.completed++;
          else if (s.key === 'in_progress') seg.in_progress++;
          else if (s.key === 'in_review') seg.in_review++;
          else seg.todo++;
          break;
        }
      }
    }
    return { done, total, seg };
  }, [taskList]);

  const visibleEmployees = showAllEmployees ? employees : employees.slice(0, 5);

  return (
    <Card className="card-premium w-full min-w-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Team &amp; Project Progress Overview
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Team Avg: {teamAvg}%
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
              Tasks Done: {totals.done}/{totals.total}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
              Active Projects: {projectStats.length}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="w-full min-w-0 overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left — Employee completion */}
          <div className="flex min-w-0 flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Employee Completion %</p>
            {employees.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No team members yet</p>
            ) : (
              <div className="space-y-2.5">
                {visibleEmployees.map((e) => (
                  <div key={e.userId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_44px] items-center gap-3" title={`${e.name}: ${e.done}/${e.total} tasks (${e.pct}%)`}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-[9px] font-bold text-white">
                        {initials(e.name.split(' ')[0] ?? '', e.name.split(' ').slice(1).join(' '))}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{e.name}</p>
                        <p className="text-[10px] text-slate-400 tabular-nums">{e.done}/{e.total} tasks</p>
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                        style={{ width: `${e.pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 text-right tabular-nums">{e.pct}%</span>
                  </div>
                ))}
                {employees.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllEmployees((v) => !v)}
                    className="self-start text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    {showAllEmployees ? 'Show less' : `View all ${employees.length} employees`}
                  </button>
                )}
              </div>
            )}

            {/* Task status breakdown footer */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Task Status Breakdown</p>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                {STATUS_SEGMENTS.map((s) => {
                  const count = totals.seg[s.key as keyof typeof totals.seg];
                  const w = totals.total ? (count / totals.total) * 100 : 0;
                  if (!w) return null;
                  return (
                    <div
                      key={s.key}
                      className={s.dot}
                      style={{ width: `${w}%` }}
                      title={`${s.label}: ${count}`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {STATUS_SEGMENTS.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label} <span className="font-semibold text-slate-700 tabular-nums">{totals.seg[s.key as keyof typeof totals.seg]}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Project progress wave */}
          <div className="flex min-w-0 flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Project Progress %</p>
            {projectStats.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No active projects yet</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                      scope === 'all'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                    }`}
                  >
                    All Projects
                  </button>
                  {projectStats.slice(0, 8).map((p) => (
                    <button
                      key={p.projectId}
                      type="button"
                      onClick={() => setScope(p.projectId)}
                      className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                        scope === p.projectId
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800">{scopeName}</span>
                  <span className="shrink-0 text-sm font-bold text-emerald-600 tabular-nums">{scopePct}%</span>
                </div>
                <ProjectWaveChart data={waveData} scopeName={scopeName} />
                <p className="mt-1.5 text-[10px] text-slate-400">Dashed line = planned 24-day target · solid = actual auto-calculated progress</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Linear-style slim auto-calculated progress bar with label. */
export function SlimProgressBar({ percent, done, total, className = '' }: { percent: number; done?: number; total?: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-end gap-1 text-[11px] text-gray-500">
        <span className="font-semibold tabular-nums text-gray-700">{pct}%</span>
        {done !== undefined && total !== undefined && (
          <span className="text-gray-400">• {done}/{total} Tasks</span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-600 progress-fill transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
