'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { useDashboardStats, type TrendPoint } from '@/lib/hooks/dashboard';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { DeliverableZone } from '@/components/deliverable-zone';
import { TaskProgressOverview } from '@/components/task-progress-overview';
import { SectionTitle } from '@/components/ui/card';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { fmtDate, fullName, initials, isOverdue, timeAgo } from '@/lib/format';
import { notificationMeta } from '@/lib/notification-meta';
import {
  Users, Network, FolderOpen, SquareCheckBig, AlertTriangle, Send, CalendarDays, CalendarRange, Palette,
  Activity, BellRing, Clock, ArrowRight, ChevronRight, MoreHorizontal, RefreshCw, Plus, ListChecks,
  BarChart3, FileText, Clapperboard, Megaphone, TrendingUp, PenTool, Code2, Building2, UsersRound,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { PendingApprovals } from '@/components/pending-approvals';
import { HrAccessRequests } from '@/components/hr-access-requests';
import { TeamProgressOverview } from '@/components/team-progress-overview';
import { Stagger, Reveal } from '@/components/ui/motion';
import { EmptyState, PageLoader } from '@/components/ui/empty-state';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';

const StatusChart = dynamic(() => import('@/components/status-chart').then((module) => module.StatusChart), {
  ssr: false,
  loading: () => <div className="h-[540px] w-full animate-pulse rounded-xl bg-gray-100/70 sm:h-[470px]" />,
});
const TrendChart = dynamic(() => import('@/components/trend-chart').then((module) => module.TrendChart), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full animate-pulse rounded-xl bg-gray-100/70" />,
});

function DeferredStatusChart(props: ComponentProps<typeof StatusChart>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!('IntersectionObserver' in window)) {
      const timeout = setTimeout(() => setShouldLoad(true), 150);
      return () => clearTimeout(timeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { root: container.closest('main'), threshold: 0.25 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-[540px] sm:h-[470px]">
      {shouldLoad ? (
        <StatusChart {...props} />
      ) : (
        <div className="h-full w-full animate-pulse rounded-xl bg-gray-100/70" />
      )}
    </div>
  );
}

function DeferredTrendChart({ data }: { data: TrendPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!('IntersectionObserver' in window)) {
      const timeout = setTimeout(() => setShouldLoad(true), 150);
      return () => clearTimeout(timeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { root: container.closest('main'), threshold: 0.25 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      {shouldLoad ? (
        <TrendChart data={data} />
      ) : (
        <div className="h-[280px] w-full animate-pulse rounded-xl bg-gray-100/70" />
      )}
    </div>
  );
}

function deptIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('smm') || n.includes('social') || n.includes('market')) return Megaphone;
  if (n.includes('sale')) return TrendingUp;
  if (n.includes('design') || n.includes('creative')) return PenTool;
  if (n.includes('dev') || n.includes('it') || n.includes('tech')) return Code2;
  if (n.includes('hr') || n.includes('people')) return UsersRound;
  return Building2;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: stats, isLoading, isError } = useDashboardStats();
  const { data: allTasksData } = useQuery({
    queryKey: ['admin-all-tasks'],
    queryFn: () => api.get('/tasks', { params: { limit: 500 } }).then((r) => r.data),
    staleTime: 30_000,
  });

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateStr = `${now.toLocaleDateString('en-US', { weekday: 'long' })}, ${now.getDate()} ${now.toLocaleDateString('en-US', { month: 'short' })} ${now.getFullYear()}`;

  const refresh = async () => {
    try {
      await queryClient.refetchQueries({ queryKey: ['dashboard'] });
      toast.success('Dashboard refreshed', 'Statistics are up to date.');
    } catch {
      toast.error('Refresh failed', 'Could not reach the dashboard API.');
    }
  };

  if (isLoading) return <PageLoader label="Loading your dashboard…" />;

  const r = stats?.recent ?? {};
  const cards = [
    { label: 'Employees', sub: 'Total team members', value: stats?.org?.activeUsers ?? 0, delta: r.users, icon: Users, cornerIcon: UsersRound, href: '/employees', tone: 'blue' as const },
    { label: 'Departments', sub: 'Active departments', value: stats?.org?.departments ?? 0, delta: r.departments, icon: Network, cornerIcon: BarChart3, href: '/departments', tone: 'purple' as const },
    { label: 'Active Projects', sub: 'Currently active', value: stats?.org?.activeProjects ?? 0, delta: r.projects, icon: FolderOpen, cornerIcon: BarChart3, href: '/projects', tone: 'green' as const },
    { label: 'Total Tasks', sub: 'All assigned tasks', value: stats?.tasks?.total ?? 0, delta: r.tasks, icon: SquareCheckBig, cornerIcon: BarChart3, href: '/tasks', tone: 'orange' as const },
    { label: 'In Review', sub: 'Pending review', value: stats?.approvals?.inReview ?? 0, delta: r.inReview, deltaTitle: 'Entered review in the last 7 days', icon: Send, cornerIcon: FileText, href: '/tasks?status=in_review', tone: 'pink' as const },
    { label: 'Overdue', sub: 'Past due tasks', value: stats?.tasks?.overdue ?? 0, delta: r.overdue, deltaTitle: 'Became overdue in the last 7 days', icon: AlertTriangle, href: '/tasks?overdue=true', tone: 'red' as const },
    { label: 'Pending Leave', sub: 'Awaiting approval', value: stats?.hr?.pendingLeave ?? 0, delta: r.pendingLeave, icon: CalendarRange, cornerIcon: CalendarDays, href: '/leave', tone: 'sky' as const },
    { label: 'Creative + Video Queue', sub: 'Items in queue', value: (stats?.approvals?.pendingCreatives ?? 0) + (stats?.approvals?.pendingVideos ?? 0), delta: r.approvals, deltaTitle: 'Requests created in the last 7 days', icon: Palette, cornerIcon: Clapperboard, href: '/creative', tone: 'violet' as const },
  ];

  const departments: any[] = stats?.departmentStats ?? [];
  const maxActive = Math.max(1, ...departments.map((d) => d.total - d.completed));
  const notifications: any[] = stats?.recentNotifications ?? [];
  const deadlines: any[] = stats?.upcomingDeadlines ?? [];
  const trend: TrendPoint[] = stats?.trend ?? [];

  return (
    <div className="relative space-y-5">
      {/* ---------- Heading ---------- */}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <motion.p
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="text-[14px] font-semibold text-gray-700"
          >
            {greeting}, {user?.firstName ?? 'Admin'}!{' '}
            <motion.span
              className="inline-block origin-[70%_70%]"
              animate={{ rotate: [0, 16, -8, 14, -4, 10, 0] }}
              transition={{ duration: 1.8, delay: 0.6, ease: 'easeInOut' }}
            >
              👋
            </motion.span>
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
            transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="mt-0.5 text-[32px] font-extrabold leading-tight tracking-tight text-gray-900 sm:text-[36px]"
          >
            Admin{' '}
            <span className="bg-[linear-gradient(110deg,#007F5F_0%,#00A878_35%,#22BA8C_55%,#00A878_75%,#007F5F_100%)] bg-[length:220%_100%] bg-clip-text text-transparent [animation:gradientShift_6s_ease-in-out_infinite]">
              Dashboard
            </span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-1 text-[13.5px] text-gray-500">
            Live overview of the whole organization. Track progress, manage tasks and keep your team aligned.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="flex shrink-0 items-center gap-2.5 self-start"
        >
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/tasks?create=1')}
            className="gradient-brand-btn flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold whitespace-nowrap lg:hidden"
          >
            <Plus className="h-4 w-4" /> New
          </motion.button>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-2.5 shadow-[0_6px_20px_-12px_rgba(17,24,39,0.25)] backdrop-blur smooth-transition hover:shadow-lg hover:scale-105 cursor-default">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 smooth-transition hover:bg-brand-100">
              <CalendarDays className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-[13px] font-bold leading-tight text-gray-900">{dateStr}</p>
              <p className="text-[11px] text-gray-500">Have a productive day!</p>
            </div>
          </div>
          <DropdownMenu
            trigger={
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.92 }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200/80 bg-white/90 text-gray-600 shadow-[0_6px_20px_-12px_rgba(17,24,39,0.25)] hover:text-gray-900 smooth-transition hover:border-brand-300"
                aria-label="Dashboard options"
              >
                <MoreHorizontal className="h-5 w-5" />
              </motion.button>
            }
          >
            <DropdownMenuItem onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" /> Refresh dashboard</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/tasks?create=1')}><Plus className="mr-2 h-4 w-4" /> Create task</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/tasks')}><ListChecks className="mr-2 h-4 w-4" /> All tasks</DropdownMenuItem>
          </DropdownMenu>
        </motion.div>
      </div>

      {isError && (
        <div className="relative rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
          Couldn&apos;t refresh dashboard statistics. Showing the last loaded data.
        </div>
      )}

      {/* ---------- Stat cards ---------- */}
      <Stagger className="relative grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4" stagger={0.07} delay={0.15}>
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </Stagger>

      {/* ---------- Pending account approvals ---------- */}
      <PendingApprovals />

      {/* ---------- HR project-visibility access requests ---------- */}
      <HrAccessRequests />

      {/* ---------- Live team & project progress analytics ---------- */}
      <TeamProgressOverview />

      {/* ---------- Overall + project-wise creative/video/website deliverable counts ---------- */}
      <DeliverableZone tasks={allTasksData?.tasks ?? []} projectWise />

      {/* ---------- Agency-wide sprint velocity analytics ---------- */}
      {(allTasksData?.tasks?.length ?? 0) > 0 && (
        <TaskProgressOverview
          tasks={allTasksData?.tasks ?? []}
          scopeLabel="AGENCY SPRINT VELOCITY"
          onSelectStage={(s) => router.push(s ? `/tasks?status=${s}` : '/tasks')}
        />
      )}

      {/* ---------- Tasks by status + department workload ---------- */}
      <div className="grid items-stretch gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Reveal className="flex rounded-2xl border border-gray-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-18px_rgba(17,24,39,0.22)]">
          <div className="w-full">
            <DeferredStatusChart />
          </div>
        </Reveal>

        <Reveal delay={0.1} className="flex flex-col rounded-2xl border border-gray-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-18px_rgba(17,24,39,0.22)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[19px] font-bold tracking-tight text-gray-900">Department workload</h3>
              <p className="mt-0.5 text-[12.5px] text-gray-500">Active tasks by department</p>
            </div>
            <Link href="/departments" className="group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 transition hover:border-brand-200 hover:text-gray-900 hover:shadow-sm">
              View all <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-3 flex flex-1 flex-col divide-y divide-gray-100">
            {departments.length === 0 ? (
              <EmptyState compact title="No departments yet" description="Create departments to see their workload." />
            ) : (
              departments.map((d, i) => {
                const active = d.total - d.completed;
                const Icon = deptIcon(d.name);
                return (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, x: 18 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link href="/departments" className="group flex items-center gap-3 py-3 transition-colors">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition-all duration-300 group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-brand-500 group-hover:text-white"
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-bold text-gray-900">{d.name}</p>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 shadow-[0_0_8px_rgba(0,168,120,0.5)]"
                            initial={{ width: 0 }}
                            whileInView={{ width: `${Math.round((active / maxActive) * 100)}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.1, delay: 0.3 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                        <p className={`mt-1 text-[11px] font-semibold ${d.overdue > 0 ? 'text-rose-600' : 'text-brand-600'}`}>
                          {d.overdue > 0 ? `${d.overdue} overdue` : 'On track'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-[11.5px] leading-snug text-gray-500">
                        <p>{d.members} {d.members === 1 ? 'person' : 'people'}</p>
                        <p>{d.completed}/{d.total} done</p>
                      </div>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-all group-hover:border-brand-200 group-hover:bg-brand-50 group-hover:text-brand-600">
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </motion.div>
                );
              })
            )}
          </div>
        </Reveal>
      </div>

      {/* ---------- Activity trend + recent notifications ---------- */}
      <div className="grid min-w-0 items-stretch gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Reveal className="card-premium card-static min-w-0 p-4 sm:p-5">
          <SectionTitle icon={Activity} tone="sky" title="Task activity" subtitle="Tasks created vs completed over the last 14 days" />
          <div className="mt-4 min-w-0">
            <DeferredTrendChart data={trend} />
          </div>
        </Reveal>
        <Reveal delay={0.1} className="card-premium card-static flex min-w-0 flex-col p-4 sm:p-5">
          <SectionTitle
            icon={BellRing}
            tone="amber"
            title="Recent activity"
            subtitle="Your latest notifications"
            action={<Link href="/notifications" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all</Link>}
          />
          <div className="mt-4 flex-1 space-y-1">
            {notifications.length === 0 ? (
              <EmptyState animation="bell" compact title="You're all caught up" description="New notifications will appear here." />
            ) : (
              notifications.slice(0, 6).map((n, i) => {
                const meta = notificationMeta(n.type);
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06 }}
                    className="group relative flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-gray-50/80"
                  >
                    <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${meta.tile} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] ${n.read ? 'font-medium text-gray-600' : 'font-semibold text-gray-900'}`}>{n.title}</p>
                      <p className="truncate text-xs text-gray-500">{n.message}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-gray-400"><Clock className="h-3 w-3" />{timeAgo(n.createdAt)}</span>
                  </motion.div>
                );
              })
            )}
          </div>
        </Reveal>
      </div>

      {/* ---------- Upcoming deadlines ---------- */}
      <Reveal className="card-premium card-static overflow-hidden">
        <div className="p-5 pb-3">
          <SectionTitle
            icon={CalendarDays}
            tone="rose"
            title="Upcoming deadlines"
            subtitle="Your next open tasks by due date"
            action={<Link href="/tasks" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all tasks</Link>}
          />
        </div>
        {deadlines.length === 0 ? (
          <EmptyState animation="success" compact title="No upcoming deadlines" description="Nothing is due for you right now." className="pb-6" />
        ) : (
          <>
          {/* Mobile stacked cards */}
          <div className="divide-y divide-gray-100 md:hidden">
            {deadlines.map((t) => {
              const a = t.assignees?.[0]?.user;
              return (
                <div key={t.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/tasks/${t.id}`} className="block text-sm font-semibold text-gray-900 hover:text-brand-700">{t.title}</Link>
                    <p className="mt-0.5 text-[11px] text-gray-400">{t.taskNumber ?? ''}{t.project?.name ? ` · ${t.project.name}` : ''}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className={isOverdue(t.deadline, t.status) ? 'font-medium text-rose-600' : ''}>
                        <CalendarDays className="mr-1 inline h-3 w-3" />{fmtDate(t.deadline)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="avatar h-6 w-6 text-[8px]">{initials(a?.firstName, a?.lastName)}</span>
                        <span className="text-gray-600">{fullName(a)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="table-premium min-w-[640px]">
              <thead>
                <tr>
                  <th>Task</th><th>Project</th><th>Due</th><th>Priority</th><th>Status</th><th>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.map((t, i) => {
                  const a = t.assignees?.[0]?.user;
                  return (
                    <motion.tr key={t.id} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                      <td><Link href={`/tasks/${t.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-700">{t.title}</Link></td>
                      <td className="text-sm text-gray-500">{t.project?.name ?? '—'}</td>
                      <td className={`text-sm ${isOverdue(t.deadline, t.status) ? 'font-semibold text-rose-600' : 'text-gray-500'}`}>{fmtDate(t.deadline)}</td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="avatar h-7 w-7 text-[9px]">{initials(a?.firstName, a?.lastName)}</span>
                          <span className="text-xs text-gray-600">{fullName(a)}</span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Reveal>
    </div>
  );
}
