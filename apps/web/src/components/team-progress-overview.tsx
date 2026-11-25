'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fullName } from '@/lib/format';
import { TrendingUp, Users, FolderKanban } from 'lucide-react';

const DONE_STATUSES = ['completed', 'approved'];
const OPEN_STATUSES = ['todo', 'in_progress', 'on_hold', 'in_review', 'changes_requested'];

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

/** Fetches tasks + projects once (shared react-query cache) for progress analytics. */
export function useProgressData() {
  const tasks = useQuery({
    queryKey: ['tasks', 'progress-overview'],
    queryFn: () => api.get('/tasks', { params: { limit: 500 } }).then((r) => r.data),
  });
  const projects = useQuery({
    queryKey: ['projects', 'progress-overview'],
    queryFn: () => api.get('/projects', { params: { limit: 100 } }).then((r) => r.data),
  });
  return {
    tasks: tasks.data?.tasks ?? [],
    projects: projects.data?.projects ?? [],
    isLoading: tasks.isLoading || projects.isLoading,
  };
}

function ChartBar({ label, pct, detail, max }: { label: string; pct: number; detail: string; max?: number }) {
  const width = max ? Math.max(2, (pct / max) * 100) : pct;
  return (
    <div className="group" title={`${label}: ${detail} (${pct}%)`}>
      <div className="flex items-center justify-between gap-2 text-xs mb-1">
        <span className="font-medium text-gray-700 truncate min-w-0">{label}</span>
        <span className="shrink-0 tabular-nums text-gray-500 group-hover:text-emerald-700 transition-colors">
          {pct}% <span className="text-gray-300">·</span> <span className="text-gray-400">{detail}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 progress-fill transition-all duration-700"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

/** Live "Team & Project Progress Overview" — employee completion + project progress charts. */
export function TeamProgressOverview({ tasks, projects }: { tasks?: any[]; projects?: any[] }) {
  const fetched = useProgressData();
  const taskList = tasks ?? fetched.tasks;
  const projectList = projects ?? fetched.projects;

  const employees = buildEmployeeStats(taskList).slice(0, 12);
  const projectStats = buildProjectStats(taskList, projectList).slice(0, 12);
  const maxEmp = Math.max(1, ...employees.map((e) => e.pct));
  const maxProj = Math.max(1, ...projectStats.map((p) => p.progress));

  return (
    <Card className="card-premium w-full min-w-0 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" /> Team &amp; Project Progress Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="w-full min-w-0 overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Employee completion
            </p>
            {employees.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No assigned tasks yet</p>
            ) : (
              <div className="space-y-2.5">
                {employees.map((e) => (
                  <ChartBar
                    key={e.userId}
                    label={e.name}
                    pct={e.pct}
                    detail={`${e.done}/${e.total} tasks`}
                    max={maxEmp}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-1.5">
              <FolderKanban className="h-3.5 w-3.5" /> Project progress
            </p>
            {projectStats.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No active projects yet</p>
            ) : (
              <div className="space-y-2.5">
                {projectStats.map((p) => (
                  <ChartBar
                    key={p.projectId}
                    label={p.name}
                    pct={p.progress}
                    detail={`${p.done}/${p.total} tasks`}
                    max={maxProj}
                  />
                ))}
              </div>
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

export { OPEN_STATUSES };
