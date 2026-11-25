'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Gauge } from 'lucide-react';
import {
  useProgressData,
  buildProjectStats,
  buildDaySeries,
  ProjectWaveChart,
  STATUS_SEGMENTS,
  type ProjectStat,
} from './team-progress-overview';

const DONE_STATUSES = ['completed', 'approved'];

/** Executive "Projects & Sprint Velocity Overview" analytics card for /projects. */
export function ProjectVelocityOverview() {
  const { tasks, projects } = useProgressData();
  const [scope, setScope] = useState<string>('all');

  const projectStats = useMemo(() => buildProjectStats(tasks, projects), [tasks, projects]);
  const startByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projectStats) {
      if (p.startDate) map.set(p.projectId, new Date(p.startDate).getTime());
    }
    return map;
  }, [projectStats]);

  const scopeProject = projectStats.find((p) => p.projectId === scope) ?? null;
  const scopeName = scopeProject?.name ?? 'All Projects';
  const scopePct = scopeProject
    ? scopeProject.progress
    : projectStats.length
      ? Math.round(projectStats.reduce((s, p) => s + p.progress, 0) / projectStats.length)
      : 0;
  const waveData = useMemo(
    () => buildDaySeries(tasks, scopeProject ? scopeProject.projectId : null, startByProject),
    [tasks, scopeProject, startByProject],
  );

  const avgProgress = projectStats.length
    ? Math.round(projectStats.reduce((s, p) => s + p.progress, 0) / projectStats.length)
    : 0;

  const totals = useMemo(() => {
    let done = 0;
    let total = 0;
    const seg = { completed: 0, in_progress: 0, in_review: 0, todo: 0 };
    for (const t of tasks ?? []) {
      if (t.status === 'cancelled') continue;
      total++;
      if (DONE_STATUSES.includes(t.status)) done++;
      for (const s of STATUS_SEGMENTS) {
        if (s.match(t.status)) {
          seg[s.key as keyof typeof seg]++;
          break;
        }
      }
    }
    return { done, total, seg };
  }, [tasks]);

  if (!projectStats.length) return null;

  return (
    <Card className="card-premium w-full min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 sm:px-6">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Gauge className="h-4 w-4 text-emerald-600" /> Projects &amp; Sprint Velocity Overview
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-400">Real-time completion &amp; 24-day cycle trajectory</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
            {projectStats.length} Active Projects
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
            Avg Progress: {avgProgress}%
          </span>
          <span className="inline-flex items-center rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
            Tasks Done: {totals.done}/{totals.total}
          </span>
        </div>
      </div>
      <CardContent className="w-full min-w-0 overflow-hidden px-5 pb-5 pt-4 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left — Project completion bars */}
          <div className="flex min-w-0 flex-col">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Project Completion %</p>
            <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
              {projectStats.map((p: ProjectStat) => (
                <div
                  key={p.projectId}
                  className="grid grid-cols-[120px_1fr_72px] items-center gap-3"
                  title={`${p.name}: ${p.done}/${p.total} tasks (${p.progress}%)`}
                >
                  <span className="truncate text-sm font-medium text-slate-800">{p.name}</span>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                  <span className="text-right">
                    <span className="block text-sm font-semibold text-slate-800 tabular-nums">{p.progress}%</span>
                    <span className="block text-[10px] text-slate-400 tabular-nums">{p.done}/{p.total}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Task breakdown footer */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Task Breakdown</p>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                {STATUS_SEGMENTS.map((s) => {
                  const count = totals.seg[s.key as keyof typeof totals.seg];
                  const w = totals.total ? (count / totals.total) * 100 : 0;
                  if (!w) return null;
                  return <div key={s.key} className={s.dot} style={{ width: `${w}%` }} title={`${s.label}: ${count}`} />;
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

          {/* Right — 24-day velocity wave */}
          <div className="flex min-w-0 flex-col">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">24-Day Sprint Velocity &amp; Progress</p>
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
            <p className="mt-1.5 text-[10px] text-slate-400">Dashed = planned 24-day target · solid = actual auto-calculated progress</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
