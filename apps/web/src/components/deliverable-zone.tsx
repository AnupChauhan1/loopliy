'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Clapperboard, Globe, Palette, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const DONE = ['completed', 'approved'];

export type DeliverableKind = 'creative' | 'video' | 'website';

/** Classify a task into Creative / Video / Website deliverable buckets. */
export function getTaskDeliverableCategory(t: any): DeliverableKind | null {
  const text = `${t.title ?? ''} ${t.category ?? ''} ${t.project?.name ?? ''} ${t.description ?? ''}`.toLowerCase();
  if (/website|landing|shopify|web\s?app|web\s?build|webpage|storefront|e-?commerce|frontend|ui\/ux|portal|web site/.test(text)) return 'website';
  if (/reel|video|reels|motion|edit|youtube|short|clip|promo video|shoot/.test(text)) return 'video';
  if (/static|post|carousel|banner|graphic|design|creative|thumbnail|story|brochure|poster|brand|social|ad\b|banner|flyer|logo/.test(text)) return 'creative';
  return null;
}

const KINDS: { key: DeliverableKind; label: string; plural: string; icon: any; cls: string; ring: string }[] = [
  { key: 'creative', label: 'Creatives', plural: 'Creative Count', icon: Palette, cls: 'from-fuchsia-500/10 to-white', ring: 'text-fuchsia-600 bg-fuchsia-50 ring-fuchsia-200' },
  { key: 'video', label: 'Videos', plural: 'Video Count', icon: Clapperboard, cls: 'from-sky-500/10 to-white', ring: 'text-sky-600 bg-sky-50 ring-sky-200' },
  { key: 'website', label: 'Websites', plural: 'Website Count', icon: Globe, cls: 'from-violet-500/10 to-white', ring: 'text-violet-600 bg-violet-50 ring-violet-200' },
];

function isDone(t: any) {
  return DONE.includes(t.status) || (t.creativeStage ?? 0) >= 4;
}

function progressOf(t: any) {
  return isDone(t) ? 100 : ['in_review', 'client_review'].includes(t.status) ? 80 : ['in_progress', 'changes_requested'].includes(t.status) ? 50 : 0;
}

/** Role-aware Production & Deliverable Zone — overall counts + optional project-wise breakdown. */
export function DeliverableZone({
  tasks,
  title = 'Production & Deliverable Zone',
  projectWise = false,
  personal = false,
}: {
  tasks: any[];
  title?: string;
  projectWise?: boolean;
  personal?: boolean;
}) {
  const [search, setSearch] = useState('');

  const { overall, byProject } = useMemo(() => {
    const overall: Record<DeliverableKind, { total: number; done: number }> = {
      creative: { total: 0, done: 0 }, video: { total: 0, done: 0 }, website: { total: 0, done: 0 },
    };
    const map = new Map<string, { name: string; tasks: any[] }>();
    for (const t of tasks) {
      const kind = getTaskDeliverableCategory(t);
      if (!kind) continue;
      overall[kind].total++;
      if (isDone(t)) overall[kind].done++;
      if (projectWise) {
        const key = t.project?.id ?? t.project?.name ?? '__general';
        const name = t.project?.name ?? 'General / Standalone';
        if (!map.has(key)) map.set(key, { name, tasks: [] });
        map.get(key)!.tasks.push(t);
      }
    }
    const rows = [...map.entries()].map(([id, g]) => {
      const counts: Record<DeliverableKind, { total: number; done: number }> = {
        creative: { total: 0, done: 0 }, video: { total: 0, done: 0 }, website: { total: 0, done: 0 },
      };
      let progSum = 0;
      for (const t of g.tasks) {
        const kind = getTaskDeliverableCategory(t);
        if (kind) { counts[kind].total++; if (isDone(t)) counts[kind].done++; }
        progSum += progressOf(t);
      }
      return {
        id, name: g.name, counts,
        progress: g.tasks.length ? Math.round(progSum / g.tasks.length) : 0,
        total: g.tasks.length,
      };
    }).sort((a, b) => b.total - a.total);
    return { overall, byProject: rows };
  }, [tasks, projectWise]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return byProject;
    return byProject.filter((p) => p.name.toLowerCase().includes(q));
  }, [byProject, search]);

  return (
    <div className="w-full min-w-0 space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
        {KINDS.map((k) => {
          const n = overall[k.key];
          const pct = n.total ? Math.round((n.done / n.total) * 100) : 0;
          return (
            <div key={k.key} className={cn('rounded-2xl border border-slate-200 bg-gradient-to-br p-4 shadow-sm sm:p-5', k.cls)}>
              <div className="flex items-center justify-between">
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl ring-1', k.ring)}>
                  <k.icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{n.done}/{n.total} done</span>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{n.total}</p>
              <p className="text-xs font-medium text-slate-500">{personal ? `My ${k.label.toLowerCase()}` : k.plural}</p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {projectWise && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <p className="text-[12px] font-bold text-slate-800">Project-Wise Deliverable Breakdown</p>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5">Project</th>
                  {KINDS.map((k) => (
                    <th key={k.key} className="px-3 py-2.5 text-center">{k.label}</th>
                  ))}
                  <th className="px-4 py-2.5 text-right">Progress</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-semibold text-slate-800">{p.name}</p>
                      <p className="text-[10px] text-slate-400">{p.total} task{p.total === 1 ? '' : 's'}</p>
                    </td>
                    {KINDS.map((k) => {
                      const c = p.counts[k.key];
                      return (
                        <td key={k.key} className="px-3 py-3 text-center">
                          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1',
                            c.done === c.total && c.total > 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-50 text-slate-600 ring-slate-200')}>
                            <CheckCircle2 className="h-3 w-3" />{c.done}/{c.total}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right">
                      <span className="text-[12px] font-bold tabular-nums text-emerald-600">{p.progress}%</span>
                    </td>
                  </tr>
                ))}
                {!filteredProjects.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No deliverable tasks found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-2 p-3 md:hidden">
            {filteredProjects.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-slate-800">{p.name}</p>
                  <span className="text-[11px] font-bold tabular-nums text-emerald-600">{p.progress}%</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {KINDS.map((k) => {
                    const c = p.counts[k.key];
                    return (
                      <div key={k.key} className="rounded-lg bg-white px-2 py-1.5 text-center ring-1 ring-slate-100">
                        <p className="text-[13px] font-bold tabular-nums text-slate-800">{c.done}/{c.total}</p>
                        <p className="text-[9px] font-semibold uppercase text-slate-400">{k.label.replace('s', '')}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!filteredProjects.length && <p className="py-6 text-center text-sm text-slate-400">No deliverable tasks found</p>}
          </div>
        </div>
      )}
    </div>
  );
}
