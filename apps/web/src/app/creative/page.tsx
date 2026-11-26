'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import api from '@/lib/api-client';
import { CreativeApprovalBoard } from '@/components/creative-approval-board';
import { DeliverableZone } from '@/components/deliverable-zone';
import { TaskProgressOverview } from '@/components/task-progress-overview';

export default function CreativePage() {
  const router = useRouter();
  const { data: tasksData } = useQuery({
    queryKey: ['creative-page-tasks'],
    queryFn: () => api.get('/tasks', { params: { limit: 500 } }).then((r) => r.data),
    staleTime: 30_000,
  });

  const tasks = tasksData?.tasks ?? [];

  return (
    <div className="space-y-6">
      {/* Strategist-scoped sprint velocity analytics */}
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
