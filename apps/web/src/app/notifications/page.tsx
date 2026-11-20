'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { timeAgo } from '@/lib/format';
import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
  });

  const readOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const open = (n: any) => {
    if (!n.read) readOne.mutate(n.id);
    const link = n.data?.link;
    if (link) router.push(link);
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">{notifications?.filter((n: any) => !n.read).length ?? 0} unread</p>
        </div>
        <button onClick={() => readAll.mutate()} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <CheckCheck className="h-4 w-4" /> Mark all read
        </button>
      </div>

      <div className="space-y-2 stagger">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>
        ) : !(notifications ?? []).length ? (
          <Card className="card-premium"><CardContent className="flex flex-col items-center py-14 text-gray-400"><Bell className="h-8 w-8 mb-2 opacity-40" /><p className="text-sm">No notifications</p></CardContent></Card>
        ) : (
          (notifications ?? []).map((n: any) => (
            <button key={n.id} onClick={() => open(n)} className={`block w-full rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-100/50 ${!n.read ? 'border-brand-200 bg-brand-50/40 hover:border-brand-300' : 'border-gray-200/80 bg-white hover:bg-gray-50'}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${!n.read ? 'bg-brand-500' : 'bg-gray-200'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'}`}>{n.title}</p>
                    <p className="shrink-0 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</p>
                  </div>
                  <p className="mt-0.5 text-[13px] text-gray-500">{n.message}</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
