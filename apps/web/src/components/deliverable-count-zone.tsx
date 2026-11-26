'use client';

import { useMemo } from 'react';
import { Palette, Clapperboard, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const DONE = ['completed', 'approved'];

const CLASSIFIERS: { key: 'creative' | 'video' | 'website'; label: string; icon: any; cls: string; ring: string; re: RegExp }[] = [
  {
    key: 'creative', label: 'Creative Count', icon: Palette,
    cls: 'from-fuchsia-500/10 to-white', ring: 'text-fuchsia-600 bg-fuchsia-50 ring-fuchsia-200',
    re: /static|post|carousel|banner|graphic|design|creative|thumbnail|story|social/i,
  },
  {
    key: 'video', label: 'Video Count', icon: Clapperboard,
    cls: 'from-sky-500/10 to-white', ring: 'text-sky-600 bg-sky-50 ring-sky-200',
    re: /reel|video|edit|youtube|motion|short|clip/i,
  },
  {
    key: 'website', label: 'Website Count', icon: Globe,
    cls: 'from-violet-500/10 to-white', ring: 'text-violet-600 bg-violet-50 ring-violet-200',
    re: /website|landing|shopify|web\s?build|webpage|storefront|e-?commerce|page build|web /i,
  },
];

/** Live production deliverable counts — auto-classified from task title/category/project. */
export function DeliverableCountZone({ tasks }: { tasks: any[] }) {
  const counts = useMemo(() => {
    const out: Record<string, { total: number; done: number }> = { creative: { total: 0, done: 0 }, video: { total: 0, done: 0 }, website: { total: 0, done: 0 } };
    for (const t of tasks) {
      const text = `${t.title ?? ''} ${t.category ?? ''} ${t.project?.name ?? ''}`;
      for (const c of CLASSIFIERS) {
        if (c.re.test(text)) {
          out[c.key].total++;
          if (DONE.includes(t.status) || (t.creativeStage ?? 0) >= 4) out[c.key].done++;
        }
      }
    }
    return out;
  }, [tasks]);

  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Production &amp; Deliverable Zone</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CLASSIFIERS.map((c) => {
          const n = counts[c.key];
          const pct = n.total ? Math.round((n.done / n.total) * 100) : 0;
          return (
            <div key={c.key} className={cn('rounded-2xl border border-slate-200 bg-gradient-to-br p-4 shadow-sm', c.cls)}>
              <div className="flex items-center justify-between">
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl ring-1', c.ring)}>
                  <c.icon className="h-4.5 w-4.5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{n.done}/{n.total} done</span>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{n.total}</p>
              <p className="text-xs font-medium text-slate-500">{c.label.replace(' Count', '')}s</p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
