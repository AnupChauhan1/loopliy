'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fullName, initials, timeAgo } from '@/lib/format';
import { FolderKanban, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

/** Super Admin panel: approve / decline HR Dashboard project-visibility requests. */
export function HrAccessRequests() {
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useQuery({
    queryKey: ['hr-project-access-requests'],
    queryFn: () => api.get('/users/project-access-requests').then((r) => r.data),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve, reason }: { id: string; approve: boolean; reason?: string }) =>
      api.post(`/users/${id}/project-access`, { approve, reason }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-project-access-requests'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const pending = (requests ?? []).filter((r: any) => r.projectAccessStatus === 'pending');
  const decided = (requests ?? []).filter((r: any) => r.projectAccessStatus !== 'pending').slice(0, 5);

  if (isLoading) {
    return (
      <Card className="card-premium">
        <CardContent className="flex items-center gap-2 p-5 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading HR access requests…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-premium">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <FolderKanban className="h-4 w-4 text-brand-600" />
          HR Project Visibility Requests
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{pending.length} pending</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {pending.length === 0 && decided.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">No project access requests yet.</p>
        )}
        {[...pending, ...decided].map((u: any) => {
          const isPending = u.projectAccessStatus === 'pending';
          return (
            <div key={u.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/40 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                {initials(u.firstName, u.lastName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {fullName(u)}
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">• {(u.roleNames ?? []).join(', ') || 'HR'}</span>
                </p>
                <p className="truncate text-[11px] text-gray-500">
                  {u.projectAccessReason ? `"${u.projectAccessReason}" · ` : ''}
                  {u.projectAccessRequestedAt ? timeAgo(u.projectAccessRequestedAt) : ''}
                </p>
              </div>
              {isPending ? (
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: u.id, approve: true })}
                    className="gradient-brand-btn rounded-lg text-white"
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve Access
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => {
                      const reason = window.prompt(`Reason for declining ${fullName(u)}'s project access request:`);
                      if (reason === null) return;
                      decide.mutate({ id: u.id, approve: false, reason: reason || undefined });
                    }}
                    className="rounded-lg border-rose-200 text-rose-600 hover:bg-rose-50"
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Decline
                  </Button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${u.projectAccessStatus === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'}`}>
                    {u.projectAccessStatus === 'approved' ? 'Enabled' : 'Declined'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: u.id, approve: u.projectAccessStatus !== 'approved' })}
                    className="rounded-lg text-[11px]"
                  >
                    {u.projectAccessStatus === 'approved' ? 'Revoke' : 'Grant'}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
