'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { CreativeApprovalBoard } from '@/components/creative-approval-board';
import { DeliverableZone } from '@/components/deliverable-zone';

export default function CreativePage() {
  const { data: tasksData } = useQuery({
    queryKey: ['creative-page-tasks'],
    queryFn: () => api.get('/tasks', { params: { limit: 500 } }).then((r) => r.data),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <DeliverableZone tasks={tasksData?.tasks ?? []} projectWise />
      <CreativeApprovalBoard />
    </div>
  );
}
