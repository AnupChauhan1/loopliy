'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fullName, fmtDate } from '@/lib/format';
import { TrendingUp } from 'lucide-react';

const DONE_STATUSES = ['completed', 'approved'];
const NON_EMPLOYEE_ROLES = ['Super Admin', 'Admin', 'Project Manager', 'HR Manager', 'Client'];

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
        progress: p.progress ?? 0,
        done: c.done,
        total: c.total,
      };
    })
    .sort((a, b) => b.progress - a.progress || b.total - a.total);
}

/** One wave point: cumulative auto progress after the first N ordered tasks. */
interface WavePoint {
  label: string;
  pct: number;
  done: number;
  total: number;
}

function projectWaveData(tasks: any[], projectId: string): WavePoint[] {
  const list = (tasks ?? [])
    .filter((t) => t.projectId === projectId && t.status !== 'cancelled')
    .sort((a, b) => {
      const ao = a.dayOffset ?? Number.MAX_SAFE_INTEGER;
      const bo = b.dayOffset ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return new Date(a.deadline ?? 0).getTime() - new Date(b.deadline ?? 0).getTime();
    });
  if (!list.length) return [];

  const points: WavePoint[] = [{ label: 'Start', pct: 0, done: 0, total: 0 }];
  let weighted = 0;
  let done = 0;
  list.forEach((t, i) => {
    weighted += taskProgress(t.status);
    if (DONE_STATUSES.includes(t.status)) done++;
    const label = t.dayOffset ? `Day ${t.dayOffset}` : fmtDate(t.deadline);
    points.push({
      label,
      pct: Math.round(weighted / (i + 1)),
      done,
      total: i + 1,
    });
  });
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

function WaveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as WavePoint | undefined;
  if (!p) return null;
  return (
    <div className="rounded-xl border border-emerald-100 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-emerald-700 tabular-nums">{p.pct}% complete</p>
      <p className="text-xs text-gray-500">{p.done}/{p.total} tasks done</p>
    </div>
  );
}

function ProjectWaveChart({ tasks, project }: { tasks: any[]; project: ProjectStat }) {
  const data = useMemo(() => projectWaveData(tasks, project.projectId), [tasks, project.projectId]);
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-gray-400">No tasks scheduled for this project yet</p>;
  }
  return (
    <div className="h-44 w-full min-w-0 sm:h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="proj-wave-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" strokeDasharray="4 6" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: '#94A3B8' }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} width={34} unit="%" />
          <Tooltip content={<WaveTooltip />} cursor={{ stroke: '#059669', strokeOpacity: 0.3, strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey="pct"
            stroke="#059669"
            strokeWidth={2.5}
            fill="url(#proj-wave-fill)"
            dot={false}
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fff', fill: '#059669' }}
            animationDuration={600}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Live "Team & Project Progress Overview" — thick employee bars + emerald project wave. */
export function TeamProgressOverview({ tasks, projects, users }: { tasks?: any[]; projects?: any[]; users?: any[] }) {
  const needFetch = tasks === undefined || projects === undefined || users === undefined;
  const fetched = useProgressData(needFetch);
  const taskList = tasks ?? fetched.tasks;
  const projectList = projects ?? fetched.projects;
  const userList = users ?? fetched.users;

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

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
      .sort((a: EmployeeStat, b: EmployeeStat) => b.pct - a.pct || a.name.localeCompare(b.name))
      .slice(0, 15);
  }, [userList, statMap, taskList]);

  const projectStats = useMemo(() => buildProjectStats(taskList, projectList), [taskList, projectList]);
  const activeProject = projectStats.find((p) => p.projectId === selectedProjectId) ?? projectStats[0];

  return (
    <Card className="card-premium w-full min-w-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Team &amp; Project Progress Overview
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Completion %
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Progress %
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="w-full min-w-0 overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left — Employee completion: thick rounded bars */}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Employee Completion %</p>
            {employees.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No team members yet</p>
            ) : (
              <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                {employees.map((e) => (
                  <div key={e.userId} className="grid grid-cols-[130px_1fr_48px] items-center gap-3" title={`${e.name}: ${e.done}/${e.total} tasks (${e.pct}%)`}>
                    <span className="text-sm font-medium text-slate-800 truncate">{e.name}</span>
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                        style={{ width: `${e.pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 text-right tabular-nums">{e.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right — Project progress: emerald wave graph */}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Project Progress %</p>
            {projectStats.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No active projects yet</p>
            ) : (
              <>
                {projectStats.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {projectStats.slice(0, 8).map((p) => (
                      <button
                        key={p.projectId}
                        type="button"
                        onClick={() => setSelectedProjectId(p.projectId)}
                        className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                          activeProject?.projectId === p.projectId
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                {activeProject && (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{activeProject.name}</span>
                    <span className="shrink-0 text-sm font-bold text-emerald-600 tabular-nums">{activeProject.progress}%</span>
                  </div>
                )}
                {activeProject && <ProjectWaveChart tasks={taskList} project={activeProject} />}
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
