'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { CreativeApprovalBoard } from '@/components/creative-approval-board';
import { DeliverableZone, getTaskDeliverableCategory } from '@/components/deliverable-zone';
import { TaskProgressOverview } from '@/components/task-progress-overview';
import { RoleDashboardHeader } from '@/components/role-dashboard-header';
import { StatCard } from '@/components/ui/stat-card';
import { Stagger } from '@/components/ui/motion';
import { isOverdue } from '@/lib/format';
import { useRouter } from 'next/navigation';
import {
  FolderKanban, CheckSquare, SearchCheck, Send, CheckCheck, AlertTriangle, Palette, Clapperboard,
} from 'lucide-react';

const DONE = ['completed', 'approved'];

export default function CreativePage() {
  const router = useRouter();
  const { data: tasksData } = useQuery({
    queryKey: ['creative-page-tasks'],
    queryFn: () => api.get('/tasks', { params: { limit: 500 } }).then((r) => r.data),
    staleTime: 30_000,
  });
  const { data: projectsData } = useQuery({
    queryKey: ['creative-page-projects'],
    queryFn: () => api.get('/projects', { params: { limit: 100 } }).then((r) => r.data),
    staleTime: 30_000,
  });

  const tasks = tasksData?.tasks ?? [];
  const projects = projectsData?.projects ?? [];
  const strategistReview = tasks.filter((t: any) => t.status === 'in_review' || (t.creativeStage ?? 0) === 2).length;
  const clientReview = tasks.filter((t: any) => t.status === 'client_review' || (t.creativeStage ?? 0) === 3).length;
  const posted = tasks.filter((t: any) => DONE.includes(t.status) || (t.creativeStage ?? 0) >= 4).length;
  const overdue = tasks.filter((t: any) => isOverdue(t.deadline, t.status)).length;
  const creatives = tasks.filter((t: any) => getTaskDeliverableCategory(t) === 'creative').length;
  const videos = tasks.filter((t: any) => getTaskDeliverableCategory(t) === 'video').length;

  const cards = [
    { label: 'Assigned Projects', sub: 'Projects in scope', value: projects.length, icon: FolderKanban, href: '/projects', tone: 'green' as const },
    { label: 'Total Tasks', sub: 'Visible to strategist', value: tasks.length, icon: CheckSquare, href: '/tasks', tone: 'blue' as const },
    { label: 'Strategist Review', sub: 'Awaiting strategy check', value: strategistReview, icon: SearchCheck, href: '/tasks?status=in_review', tone: 'amber' as const },
    { label: 'Client Review', sub: 'With the client', value: clientReview, icon: Send, href: '/tasks?status=client_review', tone: 'purple' as const },
    { label: 'Posted / Done', sub: 'Live deliverables', value: posted, icon: CheckCheck, href: '/tasks?status=completed', tone: 'emerald' as const },
    { label: 'Overdue', sub: 'Past due tasks', value: overdue, icon: AlertTriangle, href: '/tasks?overdue=true', tone: 'red' as const },
    { label: 'Creative Count', sub: 'Static, banners, design', value: creatives, icon: Palette, href: '/tasks', tone: 'pink' as const },
    { label: 'Video Count', sub: 'Reels, edits, motion', value: videos, icon: Clapperboard, href: '/tasks', tone: 'violet' as const },
  ];

  return (
    <div className="space-y-6">
      <RoleDashboardHeader
        roleLabel="Strategist"
        title="Dashboard"
        subtitle="Review queue, client approvals and creative output."
      />

      <Stagger className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4" stagger={0.07}>
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </Stagger>

      {tasks.length > 0 && (
        <TaskProgressOverview
          tasks={tasks}
          scopeLabel="STRATEGIST SPRINT VELOCITY"
          onSelectStage={(s) => router.push(s ? `/tasks?status=${s}` : '/tasks')}
        />
      )}
      <DeliverableZone tasks={tasks} projectWise />
      <CreativeApprovalBoard />
    </div>
  );
}
