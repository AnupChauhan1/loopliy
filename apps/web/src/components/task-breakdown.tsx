'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, FolderKanban, ListTodo, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SlimProgressBar } from './team-progress-overview';

const DONE = ['completed', 'approved'];
const PENDING = ['todo', 'pending', 'in_progress', 'in_review', 'client_review', 'changes_requested', 'on_hold'];

type Tab = 'all' | 'project' | 'general' | 'pending' | 'completed';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'all', label: 'All Tasks', icon: ListTodo },
  { id: 'project', label: 'Project-Wise', icon: FolderKanban },
  { id: 'general', label: 'General', icon: ListTodo },
  { id: 'pending', label: 'Pending', icon: PauseCircle },
  { id: 'completed', label: 'Completed', icon: CheckCircle2 },
];

export function TaskBreakdownTabs({ tasks, renderTask }: { tasks: any[]; renderTask: (t: any) => React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('all');

  const groups = useMemo(() => {
    const byProject = new Map<string, any[]>();
    const general: any[] = [];
    for (const t of tasks) {
      const key = t.project?.name ?? t.project?.id;
      if (key) {
        if (!byProject.has(key)) byProject.set(key, []);
        byProject.get(key)!.push(t);
      } else {
        general.push(t);
      }
    }
    return { byProject: [...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0])), general };
  }, [tasks]);

  const pending = tasks.filter((t) => PENDING.includes(t.status));
  const completed = tasks.filter((t) => DONE.includes(t.status));

  const progressOf = (list: any[]) =>
    list.length ? Math.round(list.reduce((s, t) => s + (DONE.includes(t.status) ? 100 : PENDING.includes(t.status) ? Math.min(t.progress ?? 0, 80) : 0), 0) / list.length) : 0;

  return (
    <div>
      {/* Segmented tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const count = id === 'all' ? tasks.length : id === 'project' ? groups.byProject.length : id === 'general' ? groups.general.length : id === 'pending' ? pending.length : completed.length;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                tab === id ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={cn('rounded-full px-1.5 text-[10px] font-bold', tab === id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200/70 text-slate-500')}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* All */}
      {tab === 'all' && (
        <div className="space-y-3">
          {tasks.length === 0 && <Empty />}
          {tasks.map(renderTask)}
        </div>
      )}

      {/* Project-wise */}
      {tab === 'project' && (
        <div className="space-y-4">
          {groups.byProject.length === 0 && <Empty text="No project tasks" />}
          {groups.byProject.map(([name, list]) => (
            <div key={name} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                <p className="flex items-center gap-2 text-[13px] font-bold text-slate-800"><FolderKanban className="h-4 w-4 text-emerald-600" /> {name}</p>
                <span className="text-[11px] font-semibold text-slate-500">{list.filter((t) => DONE.includes(t.status)).length}/{list.length} done</span>
              </div>
              <div className="px-4 pt-2.5"><SlimProgressBar percent={progressOf(list)} done={list.filter((t) => DONE.includes(t.status)).length} total={list.length} /></div>
              <div className="space-y-2 p-3">{list.map(renderTask)}</div>
            </div>
          ))}
        </div>
      )}

      {/* General */}
      {tab === 'general' && (
        <div className="space-y-3">
          {groups.general.length === 0 && <Empty text="No standalone tasks" />}
          {groups.general.map(renderTask)}
        </div>
      )}

      {/* Pending */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {pending.length === 0 && <Empty text="Nothing pending 🎉" />}
          {pending.map(renderTask)}
        </div>
      )}

      {/* Completed */}
      {tab === 'completed' && (
        <div className="space-y-3">
          {completed.length === 0 && <Empty text="Nothing completed yet" />}
          {completed.map(renderTask)}
        </div>
      )}
    </div>
  );
}

function Empty({ text = 'No tasks' }: { text?: string }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 py-8 text-center text-sm text-slate-400">{text}</p>;
}
