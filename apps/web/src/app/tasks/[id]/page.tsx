'use client';

import { useState, use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { TaskActions, ReviewActions } from '@/components/task-actions';
import { CelebrationBurst } from '@/components/ui/celebration';
import { useCompletionCelebration } from '@/lib/use-sound-prefs';
import { fmtDate, fmtDateTime, fullName, initials, isOverdue, statusLabel, timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { isManager } from '@/lib/roles';
import { ArrowLeft, Paperclip, Send, MessageSquare, ListChecks, History, Upload, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, role } = useAuth();
  const manager = isManager(role);
  const { celebrating } = useCompletionCelebration();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState('');
  const [error, setError] = useState('');

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => api.get(`/tasks/${id}`).then((r) => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['task', id] });

  const addComment = useMutation({
    mutationFn: () => api.post(`/tasks/${id}/comments`, { content: comment }),
    onSuccess: () => { invalidate(); setComment(''); },
  });

  const addChecklist = useMutation({
    mutationFn: () => api.post(`/tasks/${id}/checklist`, { title: newItem }),
    onSuccess: () => { invalidate(); setNewItem(''); },
  });

  const toggleItem = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      api.put(`/tasks/${id}/checklist/${itemId}`, { completed }),
    onSuccess: invalidate,
  });

  const uploadFile = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/tasks/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: invalidate,
    onError: (e: any) => setError(e.response?.data?.message || 'Upload failed'),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api.post(`/tasks/${id}/status`, { status }),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.response?.data?.message || 'Failed'),
  });

  const isAssignee = task?.assignees?.some((a: any) => a.userId === user?.id);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>;
  }
  if (!task) {
    return <div className="py-16 text-center text-sm text-gray-400">Task not found</div>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <CelebrationBurst active={celebrating} />
      <div className="flex items-center gap-3">
        <Link href="/tasks" className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:shadow-md hover:-translate-x-0.5 transition-all duration-200">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{task.title}</h1>
            <span className="text-xs font-mono text-gray-400">{task.taskNumber}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {task.project?.name ?? 'No project'} {task.department ? `· ${task.department.name}` : ''} {task.category ? `· ${task.category}` : ''}
          </p>
        </div>
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card className="card-premium">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-900">Description</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description || 'No description provided.'}</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><p className="text-[11px] text-gray-400">Due date</p><p className={`font-medium ${isOverdue(task.deadline, task.status) ? 'text-rose-600' : 'text-gray-800'}`}>{fmtDate(task.deadline)}</p></div>
                <div><p className="text-[11px] text-gray-400">Est. hours</p><p className="font-medium text-gray-800">{task.estimatedHours ?? '—'}</p></div>
                <div><p className="text-[11px] text-gray-400">Progress</p><p className="font-medium text-gray-800">{task.progress}%</p></div>
                <div><p className="text-[11px] text-gray-400">Approval</p><p className="font-medium text-gray-800">{task.requiresApproval ? 'Required' : 'Not required'}</p></div>
              </div>
            </CardContent>
          </Card>

          {(isAssignee || manager) && (
            <Card className="card-premium">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-900">Actions</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <TaskActions task={task} />
                <ReviewActions task={task} />
                {manager && !['completed', 'cancelled'].includes(task.status) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    {task.status !== 'on_hold' && (
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setStatus.mutate('on_hold')}>Put on hold</Button>
                    )}
                    {task.status === 'on_hold' && (
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setStatus.mutate('todo')}>Reopen</Button>
                    )}
                    <Button size="sm" variant="outline" className="rounded-xl text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setStatus.mutate('cancelled')}>Cancel task</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Checklist */}
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2"><ListChecks className="h-4 w-4 text-brand-600" /> Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(task.checklists ?? []).map((item: any) => (
                <label key={item.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(e) => toggleItem.mutate({ itemId: item.id, completed: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600"
                  />
                  <span className={`text-sm ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.title}</span>
                </label>
              ))}
              {(isAssignee || manager) && (
                <div className="flex gap-2 pt-1">
                  <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newItem && addChecklist.mutate()} placeholder="Add a subtask..." className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => addChecklist.mutate()} disabled={!newItem.trim()}>Add</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comments */}
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-brand-600" /> Comments & notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && comment.trim() && addComment.mutate()} placeholder="Add a comment or work note..." className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" />
                <Button size="sm" onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending} className="gradient-brand-btn text-white border-0 rounded-xl"><Send className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-3 stagger">
                {(task.comments ?? []).map((c: any) => (
                  <div key={c.id} className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">{initials(c.user?.firstName, c.user?.lastName)}</span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500"><span className="font-semibold text-gray-800">{fullName(c.user)}</span> · {timeAgo(c.createdAt)}</p>
                      <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{c.content}</p>
                    </div>
                  </div>
                ))}
                {!task.comments?.length && <p className="text-sm text-gray-400">No comments yet</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {/* Assignees */}
          <Card className="card-premium">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-900">Assignees</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              {task.assignees?.length ? task.assignees.map((a: any) => (
                <div key={a.id} className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full gradient-brand text-[10px] font-semibold text-white">{initials(a.user.firstName, a.user.lastName)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{fullName(a.user)}</p>
                    <p className="text-[11px] text-gray-400">{a.user.email}</p>
                  </div>
                </div>
              )) : <p className="text-sm text-gray-400">Unassigned</p>}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Paperclip className="h-4 w-4 text-brand-600" /> Attachments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(task.attachments ?? []).map((f: any) => (
                <a key={f.id} href={`${API_BASE}${f.url}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/40 hover:-translate-y-0.5 hover:shadow-md hover:shadow-brand-100/50 transition-all duration-200">
                  <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-[13px] text-gray-700 truncate">{f.name}</span>
                </a>
              ))}
              {(isAssignee || manager) && (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/30 transition-all duration-200">
                  <Upload className="h-4 w-4" />
                  {uploadFile.isPending ? 'Uploading...' : 'Upload file'}
                  <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile.mutate(e.target.files[0])} />
                </label>
              )}
            </CardContent>
          </Card>

          {/* History */}
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2"><History className="h-4 w-4 text-brand-600" /> Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-3">
                <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-100" />
                {(task.statusHistory ?? []).map((h: any) => (
                  <div key={h.id} className="relative flex gap-3 pl-5">
                    <span className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full bg-brand-100 ring-2 ring-brand-400" />
                    <div>
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">{statusLabel(h.fromStatus)}</span> → <span className="font-medium">{statusLabel(h.toStatus)}</span>
                      </p>
                      <p className="text-[11px] text-gray-400">{fmtDateTime(h.changedAt)}</p>
                    </div>
                  </div>
                ))}
                {!task.statusHistory?.length && <p className="text-sm text-gray-400">No activity yet</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
