'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { ReviewActions } from '@/components/task-actions';
import { fmtDate, fullName, initials, isOverdue } from '@/lib/format';
import { FolderKanban, CheckSquare, Send, AlertTriangle, Palette, Clapperboard } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { StatCard } from '@/components/ui/stat-card';
import { Stagger } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { useManagerDashboardStats } from '@/lib/hooks/dashboard';

export default function ManagerDashboard() {
  const { user } = useAuth();

  const { data: stats } = useManagerDashboardStats();

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
    queryFn: () => api.get('/projects', { params: { limit: 20 } }).then((r) => r.data),
  });

  const reviewTasks = reviewQueue?.tasks ?? [];
  const overdueTasks = overdueData?.tasks ?? [];
  const projects = projectsData?.projects ?? [];

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
      <PageHeader eyebrow={`Welcome back, ${user?.firstName ?? ''}`} title="Manager" highlight="Dashboard" description="Your projects, reviews and team workload." />

      <Stagger className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3" stagger={0.07}>
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </Stagger>

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
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 progress-fill" style={{ width: `${p.progress}%` }} />
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
