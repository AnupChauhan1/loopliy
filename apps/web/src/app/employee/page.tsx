'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { RemoteTaskControls } from '@/components/remote-task-controls';
import { UrgentAlarm } from '@/components/urgent-alarm';
import { CelebrationBurst } from '@/components/ui/celebration';
import { useCompletionCelebration } from '@/lib/use-sound-prefs';
import { useAuth } from '@/lib/auth-context';
import { fmtDate, isOverdue, timeAgo } from '@/lib/format';
import { CheckSquare, Clock, Send, AlertTriangle, CalendarDays, Megaphone, CheckCheck, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/ui/stat-card';
import { Stagger } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { useMyDashboardStats } from '@/lib/hooks/dashboard';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { celebrating } = useCompletionCelebration();

  const { data: stats } = useMyDashboardStats();

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api.get('/tasks/my', { params: { limit: 50 } }).then((r) => r.data),
  });

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get('/announcements').then((r) => r.data),
  });

  const tasks: any[] = tasksData?.tasks ?? [];
  const now = new Date();
  const today = now.toDateString();

  const todoTasks = tasks.filter((t) => ['todo', 'changes_requested', 'on_hold'].includes(t.status));
  const inProgress = tasks.filter((t) => t.status === 'in_progress');
  const inReview = tasks.filter((t) => t.status === 'in_review');
  const changesRequested = tasks.filter((t) => t.status === 'changes_requested');
  const todayTasks = tasks.filter((t) => t.deadline && new Date(t.deadline).toDateString() === today);
  const overdue = tasks.filter((t) => isOverdue(t.deadline, t.status));
  const completed = tasks.filter((t) => t.status === 'completed').slice(0, 5);

  const cards = [
    { label: "Today's Tasks", sub: 'Due today', value: todayTasks.length, icon: CalendarDays, tone: 'sky' as const },
    { label: 'In Progress', sub: 'Being worked on', value: inProgress.length, icon: Clock, tone: 'green' as const },
    { label: 'Pending Review', sub: 'Waiting for manager', value: inReview.length, icon: Send, tone: 'purple' as const },
    { label: 'Changes Requested', sub: 'Needs rework', value: changesRequested.length, icon: RotateCcw, tone: 'orange' as const },
    { label: 'Overdue', sub: 'Past due', value: overdue.length, icon: AlertTriangle, tone: 'red' as const },
    { label: 'Completed', sub: 'All time', value: stats?.tasks?.my?.completed ?? completed.length, icon: CheckCheck, tone: 'emerald' as const },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <CelebrationBurst active={celebrating} />
      <PageHeader eyebrow={`Hey ${user?.firstName ?? 'there'} 👋`} title="My" highlight="Workspace" description="Here's your workload for today." />

      <UrgentAlarm tasks={tasks} />

      <Stagger className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3" stagger={0.07}>
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Action needed */}
          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-brand-600" /> Needs your attention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 stagger">
              {isLoading ? (
                <p className="text-sm text-gray-400 py-6 text-center">Loading tasks...</p>
              ) : todoTasks.length === 0 && inProgress.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">All caught up — nothing needs your attention 🎉</p>
              ) : (
                [...inProgress, ...todoTasks].map((task) => (
                  <div key={task.id} className="rounded-xl border border-gray-200/80 p-4 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-100/60 hover:-translate-y-0.5 transition-all duration-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/tasks/${task.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-700">
                            {task.title}
                          </Link>
                          <span className="text-[10px] font-mono text-gray-400">{task.taskNumber}</span>
                          <PriorityBadge priority={task.priority} />
                          <StatusBadge status={task.status} />
                          {task.requiresApproval && (
                            <span className="text-[10px] font-medium text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">needs approval</span>
                          )}
                          {(task.isOverdue || (task.deadline && new Date(task.deadline) < now && !['completed', 'cancelled', 'approved'].includes(task.status))) && (
                            <span className="text-[10px] font-bold text-white bg-rose-600 rounded-full px-2 py-0.5 animate-pulse">carried over · urgent</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{task.description}</p>
                        <p className={`text-xs mt-1.5 ${isOverdue(task.deadline, task.status) ? 'text-rose-600 font-medium' : 'text-gray-400'}`}>
                          {isOverdue(task.deadline, task.status) ? '⚠ Overdue · ' : 'Due '}
                          {fmtDate(task.deadline)} {task.project?.name ? `· ${task.project.name}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 w-20">
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 progress-fill" style={{ width: `${task.progress}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-400 text-right mt-1">{task.progress}%</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <RemoteTaskControls task={task} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* In review */}
          {inReview.length > 0 && (
            <Card className="card-premium">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-gray-900">Awaiting review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {inReview.map((task) => (
                  <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 hover:border-brand-300 hover:shadow-md hover:shadow-brand-100 transition-all duration-200">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{task.title}</p>
                      <p className="text-xs text-gray-500">Waiting for manager review</p>
                    </div>
                    <StatusBadge status={task.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* Announcements */}
          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-brand-600" /> Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!announcements?.length ? (
                <p className="text-sm text-gray-400">No announcements</p>
              ) : (
                announcements.slice(0, 4).map((a: any) => (
                  <div key={a.id} className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[13px] font-semibold text-gray-900">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.content}</p>
                    <p className="text-[11px] text-gray-400 mt-1.5">{timeAgo(a.createdAt)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recently completed */}
          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900">Recently completed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {completed.length === 0 ? (
                <p className="text-sm text-gray-400">Nothing completed yet</p>
              ) : (
                completed.map((task) => (
                  <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50">
                    <CheckCheck className="h-4 w-4 text-brand-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-gray-700 truncate">{task.title}</p>
                      <p className="text-[11px] text-gray-400">{fmtDate(task.completedAt)}</p>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
