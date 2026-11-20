'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { fmtDate, fullName, initials, timeAgo } from '@/lib/format';
import { Users, CalendarOff, Clock, Network, AlertTriangle, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/ui/stat-card';
import { Stagger } from '@/components/ui/motion';
import { PageHeader } from '@/components/ui/page-header';
import { useHrDashboardStats } from '@/lib/hooks/dashboard';

export default function HRDashboard() {
  const { data: stats } = useHrDashboardStats();

  const { data: leaveData } = useQuery({
    queryKey: ['leave-pending'],
    queryFn: () => api.get('/leave', { params: { status: 'pending' } }).then((r) => r.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const { data: attendanceData } = useQuery({
    queryKey: ['attendance-today-all'],
    queryFn: () => api.get('/attendance').then((r) => r.data),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  const pendingLeave = leaveData ?? [];
  const users = usersData ?? [];
  const todayAttendance = (attendanceData ?? []).filter((r: any) => new Date(r.date).toDateString() === new Date().toDateString());
  const presentToday = todayAttendance.filter((r: any) => r.status === 'present').length;
  const newJoiners = users.filter((u: any) => u.employeeProfile?.dateOfJoining && new Date(u.employeeProfile.dateOfJoining) > new Date(Date.now() - 30 * 86400000));

  const decide = async (id: string, action: 'approve' | 'reject') => {
    await api.post(`/leave/${id}/decide`, { action });
    window.location.reload();
  };

  const cards = [
    { label: 'Total employees', sub: 'Everyone in the org', value: stats?.org?.totalUsers ?? 0, delta: stats?.recent?.users, icon: Users, href: '/employees', tone: 'blue' as const },
    { label: 'Present today', sub: 'Checked in today', value: presentToday, icon: Clock, href: '/attendance', tone: 'green' as const },
    { label: 'Pending leave', sub: 'Awaiting decision', value: pendingLeave.length, delta: stats?.recent?.pendingLeave, icon: CalendarOff, href: '/leave', tone: 'amber' as const },
    { label: 'Departments', sub: 'Active departments', value: stats?.org?.departments ?? 0, delta: stats?.recent?.departments, icon: Network, href: '/departments', tone: 'purple' as const },
    { label: 'Overdue tasks', sub: 'Past due', value: stats?.tasks?.overdue ?? 0, delta: stats?.recent?.overdue, icon: AlertTriangle, href: '/tasks?overdue=true', tone: 'red' as const },
    { label: 'New this month', sub: 'Joined in the last 30 days', value: newJoiners.length, icon: UserPlus, href: '/employees', tone: 'pink' as const },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader eyebrow="People operations" title="HR" highlight="Dashboard" description="Workforce, leave and attendance overview." />

      <Stagger className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3" stagger={0.07}>
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="card-premium">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-900">Pending leave requests</CardTitle>
            <Link href="/leave" className="text-xs font-medium text-brand-600">Manage</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingLeave.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No pending requests</p>
            ) : (
              pendingLeave.map((l: any) => (
                <div key={l.id} className="rounded-xl border border-gray-100 bg-gray-50/40 p-4 hover:border-gray-200 hover:shadow-md hover:shadow-gray-100 transition-all duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{fullName(l.user)}</p>
                      <p className="text-xs text-gray-500 mt-0.5 capitalize">{l.type} leave · {l.days} day(s) · {fmtDate(l.startDate)} → {fmtDate(l.endDate)}</p>
                      {l.reason && <p className="text-xs text-gray-400 mt-1 italic">"{l.reason}"</p>}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => decide(l.id, 'approve')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-all duration-150 hover:shadow-md hover:shadow-brand-200 active:scale-95">Approve</button>
                      <button onClick={() => decide(l.id, 'reject')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-all duration-150 active:scale-95">Reject</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900">Headcount by department</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 stagger">
              {(departments ?? []).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-3.5 hover:border-brand-200 hover:shadow-md hover:shadow-brand-100/50 transition-all duration-200">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{d.name}</p>
                      <p className="text-[11px] text-gray-400">Head: {d.head ? fullName(d.head) : '—'}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{d._count.members} people</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="card-premium">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900">Recent leave decisions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(leaveData ?? []).filter((l: any) => l.status !== 'pending').slice(0, 5).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-gray-50">
                  <div>
                    <p className="text-[13px] font-medium text-gray-800">{fullName(l.user)}</p>
                    <p className="text-[11px] text-gray-400">{l.days}d {l.type} · {timeAgo(l.approvedAt)}</p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
              ))}
              {!(leaveData ?? []).filter((l: any) => l.status !== 'pending').length && (
                <p className="py-4 text-center text-sm text-gray-400">No decisions yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
