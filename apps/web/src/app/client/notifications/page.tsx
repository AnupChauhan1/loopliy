'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import api from '@/lib/api-client';

interface Notification {
  id: string; type: string; title: string; message: string;
  read: boolean; readAt: string | null; createdAt: string;
}

export default function ClientNotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery<Notification[]>({
    queryKey: ['client-notifications'],
    queryFn: () => api.get<Notification[]>('/notifications').then((r) => r.data),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-notifications'] }),
  });

  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">{unread} unread</p>
        </div>
        {unread > 0 && (
          <button onClick={() => markAll.mutate()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <CheckCheck className="h-4 w-4" />Mark all read
          </button>
        )}
      </div>
      {notifications.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}
      {!notifications.isLoading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          <Bell className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          You're all caught up — no notifications yet.
        </div>
      )}
      <div className="space-y-2">
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => !n.read && markRead.mutate(n.id)}
            className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${n.read ? 'border-gray-100 bg-white opacity-70' : 'border-brand-200 bg-brand-50/50'}`}
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-gray-300' : 'bg-brand-600'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{n.title}</p>
              <p className="mt-0.5 text-sm text-gray-600">{n.message}</p>
              <p className="mt-1 text-xs text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
