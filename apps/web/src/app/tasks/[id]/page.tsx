'use client';

import { useState, use, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { CelebrationBurst } from '@/components/ui/celebration';
import { useCompletionCelebration } from '@/lib/use-sound-prefs';
import { fmtDate, fmtDateTime, fullName, initials, isOverdue, statusLabel, timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { isManager } from '@/lib/roles';
import {
  ArrowLeft, Send, MessageSquare, ListChecks, History, Trash2,
  UserPlus, Check, ClipboardPaste, Link2, MessageCircle, Loader2, ChevronRight, XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { TaskProgressBar } from '@/components/task-progress-bar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const STAGE_FLOW = [
  { stage: 1, label: 'Design Ready', hint: '25% · In Progress' },
  { stage: 2, label: 'Strategist Check', hint: '50% · In Review' },
  { stage: 3, label: 'Client Approval', hint: '75% · Client Review' },
  { stage: 4, label: 'Posted / Live', hint: '100% · Completed' },
];

const NEXT_CTA: Record<number, { label: string; to: number }> = {
  0: { label: 'Submit Work for Strategist Check →', to: 2 },
  1: { label: 'Send for Strategist Check →', to: 2 },
  2: { label: 'Approve & Send to Client →', to: 3 },
  3: { label: 'Mark Approved by Client →', to: 4 },
};

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, role } = useAuth();
  const manager = isManager(role);
  const { celebrating } = useCompletionCelebration();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState('');
  const [error, setError] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [deliverableLink, setDeliverableLink] = useState('');
  const [pasteFlash, setPasteFlash] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<{ url: string; name: string; size: number } | null>(null);

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => api.get(`/tasks/${id}`).then((r) => r.data),
  });

  useEffect(() => {
    if (task?.deliverableUrl && !deliverableLink) setDeliverableLink(task.deliverableUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', id] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

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
    onSuccess: () => {
      invalidate();
      setLocalPreview(null);
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 3000);
    },
    onError: (e: any) => setError(e.response?.data?.message || 'Upload failed'),
  });

  const setStage = useMutation({
    mutationFn: (body: any) => api.post(`/tasks/${id}/creative-stage`, body).then((r) => r.data),
    onSuccess: () => { invalidate(); setRevisionOpen(false); setRevisionNote(''); },
    onError: (e: any) => setError(e.response?.data?.message || 'Stage update failed'),
  });

  const saveLink = useMutation({
    mutationFn: (url: string) => api.put(`/tasks/${id}`, { deliverableUrl: url || null }).then((r) => r.data),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.response?.data?.message || 'Failed to save link'),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api.post(`/tasks/${id}/status`, { status }),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.response?.data?.message || 'Failed'),
  });

  const deleteTask = useMutation({
    mutationFn: () => api.delete(`/tasks/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); router.push('/tasks'); },
    onError: (e: any) => setError(e.response?.data?.message || 'Delete failed'),
  });

  // People who can be assigned: project team members first, then all active employees
  const { data: assignUsers } = useQuery({
    queryKey: ['users', 'assign-picker'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: manager,
  });
  const { data: assignProject } = useQuery({
    queryKey: ['project', 'assign-picker', task?.projectId],
    queryFn: () => api.get(`/projects/${task!.projectId}`).then((r) => r.data),
    enabled: manager && !!task?.projectId,
  });

  const assignTask = useMutation({
    mutationFn: (userId: string) => api.put(`/tasks/${id}`, { assigneeIds: [userId] }).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setAssignOpen(false);
    },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed to update assignee'),
  });

  const assignOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string; email?: string; member: boolean }[] = [];
    for (const m of assignProject?.members ?? []) {
      const u = m.user;
      if (!u?.id || seen.has(u.id)) continue;
      seen.add(u.id);
      opts.push({ id: u.id, name: fullName(u) || u.email, email: u.email, member: true });
    }
    for (const u of assignUsers ?? []) {
      if (!u?.id || !u.isActive || seen.has(u.id)) continue;
      if ((u.roleNames ?? []).some((r: string) => ['Super Admin', 'Admin', 'Project Manager', 'HR Manager', 'Client'].includes(r))) continue;
      seen.add(u.id);
      opts.push({ id: u.id, name: fullName(u) || u.email, email: u.email, member: false });
    }
    return opts;
  }, [assignProject, assignUsers]);

  const isAssignee = task?.assignees?.some((a: any) => a.userId === user?.id);
  const canWork = isAssignee || manager;

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type === 'application/pdf' || file.size < 30 * 1024 * 1024) {
      setLocalPreview(file.type.startsWith('image/') ? { url: URL.createObjectURL(file), name: file.name, size: file.size } : null);
      uploadFile.mutate(file);
    } else {
      setError('Please attach an image, video or PDF.');
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) { e.preventDefault(); handleFile(f); return; }
      }
    }
  };

  // Global Ctrl+V anywhere on the task page attaches screenshots directly
  useEffect(() => {
    const onWinPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && f.type.startsWith('image/')) {
            e.preventDefault();
            const named = new File([f], `screenshot-${Date.now()}.png`, { type: f.type || 'image/png' });
            handleFile(named);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onWinPaste);
    return () => window.removeEventListener('paste', onWinPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sendWhatsApp = () => {
    if (!task) return;
    const project = task.project?.name ?? 'No project';
    const stageName = STAGE_FLOW[Math.min((task.creativeStage ?? 0) - 1, 3)]?.label ?? 'Not started';
    const link = `${window.location.origin}/tasks/${task.id}`;
    const text = encodeURIComponent(
      `🔔 *LOOPLY — Approval Needed*\n\n*Project:* ${project}\n*Task:* ${task.title}${task.taskNumber ? ` (${task.taskNumber})` : ''}\n*Stage:* ${stageName}\n*Deliverable:* ${task.deliverableUrl ?? 'See attachments in LOOPLY'}\n*Review & approve:* ${link}`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
    api.post(`/tasks/${id}/comments`, { content: `📲 Important WhatsApp Alert sent — "${stageName}" stage • ${project}` }).then(invalidate).catch(() => {});
  };

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>;
  }
  if (!task) {
    return <div className="py-16 text-center text-sm text-gray-400">Task not found</div>;
  }

  const stage: number = task.creativeStage ?? 0;
  const posted = stage >= 4 || task.status === 'completed' || task.status === 'approved';
  const cta = NEXT_CTA[stage];
  const imageAttachments = (task.attachments ?? []).filter((f: any) => (f.mimeType ?? '').startsWith('image/'));

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
          {/* ============ 3-STEP WORKFLOW ============ */}
          <Card className="card-premium !border-emerald-200/70">
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-gray-900">Submit &amp; Get Approval</CardTitle>
              <button
                type="button"
                onClick={sendWhatsApp}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#25D366]/10 px-3 text-[11px] font-bold text-[#128C7E] ring-1 ring-[#25D366]/40 transition hover:bg-[#25D366]/20"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Update
              </button>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* STEP 1 — Attach work */}
              <div>
                <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">1</span>
                  Attach your work
                </p>
                <div
                  onPaste={onPaste}
                  onClick={() => canWork && fileRef.current?.click()}
                  className={`rounded-xl border-2 border-dashed p-4 text-center transition ${canWork ? 'cursor-pointer border-emerald-300/70 bg-emerald-50/40 hover:border-emerald-400 hover:bg-emerald-50/70' : 'border-gray-200 bg-gray-50/50'}`}
                >
                  {uploadFile.isPending ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-600" />
                  ) : (
                    <ClipboardPaste className="mx-auto h-5 w-5 text-emerald-600" />
                  )}
                  <p className="mt-1.5 text-xs font-semibold text-gray-700">
                    Paste Screenshot <span className="font-normal text-gray-400">(Ctrl+V)</span> or Upload Image / Video / PDF
                  </p>
                  <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                </div>
                {pasteFlash && <p className="mt-1.5 text-center text-[11px] font-bold text-emerald-700">Pasted via Ctrl+V ✓</p>}

                {/* Deliverable previews */}
                {(localPreview || imageAttachments.length > 0) && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {localPreview && (
                      <div className="relative overflow-hidden rounded-lg border border-emerald-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={localPreview.url} alt={localPreview.name} className="h-16 w-full object-cover" />
                        <span className="absolute bottom-0 left-0 right-0 bg-emerald-600/90 px-1 py-0.5 text-center text-[8px] font-bold text-white">Uploading…</span>
                      </div>
                    )}
                    {imageAttachments.slice(0, 7).map((f: any) => (
                      <a key={f.id} href={`${API_BASE}${f.url}`} target="_blank" rel="noreferrer" className="group relative overflow-hidden rounded-lg border border-gray-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${API_BASE}${f.url}`} alt={f.name} className="h-16 w-full object-cover transition group-hover:scale-105" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Deliverable link */}
                <div className="mt-3 flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      value={deliverableLink}
                      onChange={(e) => setDeliverableLink(e.target.value)}
                      placeholder="Deliverable link (Figma / Drive / live URL)"
                      className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!deliverableLink.trim() || saveLink.isPending || deliverableLink === task.deliverableUrl}
                    onClick={() => saveLink.mutate(deliverableLink.trim())}
                    className="h-10 shrink-0 rounded-xl bg-slate-800 px-4 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* STEP 2 — Approval tracker */}
              <div>
                <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">2</span>
                  Approval progress
                </p>
                <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                  <div className="mb-4 flex items-start">
                    {STAGE_FLOW.map((s, i) => {
                      const reached = stage >= s.stage;
                      const current = stage === s.stage;
                      return (
                        <div key={s.stage} className="flex flex-1 items-start last:flex-none">
                          <div className="flex flex-col items-center">
                            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ring-2 transition ${
                              reached ? 'bg-emerald-500 text-white ring-emerald-300' : 'bg-white text-gray-400 ring-gray-200'
                            } ${current ? 'shadow-[0_0_0_4px_rgba(16,185,129,0.15)]' : ''}`}>
                              {reached ? <Check className="h-3.5 w-3.5" /> : s.stage}
                            </span>
                            <span className={`mt-1.5 max-w-[76px] text-center text-[9px] font-semibold leading-tight ${reached ? 'text-emerald-700' : 'text-gray-400'}`}>
                              {s.label}
                            </span>
                            <span className="text-[8px] text-gray-300">{s.hint}</span>
                          </div>
                          {i < STAGE_FLOW.length - 1 && (
                            <div className={`mx-1 mt-3 h-0.5 flex-1 rounded-full ${stage > s.stage ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {canWork && !posted && cta && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={setStage.isPending}
                        onClick={() => setStage.mutate({ stage: cta.to })}
                        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-[13px] font-bold text-white shadow-[0_8px_20px_-4px_rgba(5,150,105,0.45)] transition hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.99] disabled:opacity-50"
                      >
                        {setStage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                        {cta.label}
                      </button>
                      {stage >= 2 && (
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => setRevisionOpen((v) => !v)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 transition hover:text-rose-600"
                          >
                            <XCircle className="h-3 w-3" /> Need Changes
                          </button>
                          {stage === 3 && (
                            <button
                              type="button"
                              disabled={setStage.isPending}
                              onClick={() => setStage.mutate({ stage: 4 })}
                              className="text-[11px] font-semibold text-slate-500 underline-offset-2 transition hover:text-slate-700 hover:underline"
                            >
                              or Mark as Posted &amp; Complete ✓
                            </button>
                          )}
                        </div>
                      )}
                      {revisionOpen && (
                        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                          <input
                            value={revisionNote}
                            onChange={(e) => setRevisionNote(e.target.value)}
                            placeholder="What needs to change?"
                            className="h-9 w-full rounded-lg border border-rose-200 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-rose-300"
                          />
                          <button
                            type="button"
                            disabled={!revisionNote.trim() || setStage.isPending}
                            onClick={() => setStage.mutate({ action: 'revision', note: revisionNote })}
                            className="h-9 w-full rounded-lg bg-rose-600 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
                          >
                            Send Revision Request
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {posted && (
                    <div className="rounded-xl bg-emerald-100/70 px-3 py-2.5 text-center">
                      <p className="text-xs font-bold text-emerald-800">🎉 Posted — task completed at 100%</p>
                    </div>
                  )}
                  {!canWork && !posted && (
                    <p className="text-center text-[11px] text-gray-400">Only the assignee or a manager can advance this task.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* STEP 3 — Checklist & notes (kept clean below) */}
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">3</span>
                <ListChecks className="h-4 w-4 text-emerald-600" /> Subtasks &amp; notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Checklist */}
              <div className="space-y-2">
                {(task.checklists ?? []).map((item: any) => (
                  <label key={item.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={(e) => toggleItem.mutate({ itemId: item.id, completed: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                    />
                    <span className={`text-sm ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.title}</span>
                  </label>
                ))}
                {canWork && (
                  <div className="flex gap-2 pt-1">
                    <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newItem && addChecklist.mutate()} placeholder="Add a subtask..." className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                    <button onClick={() => addChecklist.mutate()} disabled={!newItem.trim()} className="rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40">Add</button>
                  </div>
                )}
              </div>

              {/* Comments */}
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  <MessageSquare className="h-3.5 w-3.5" /> Revision notes &amp; updates
                </p>
                <div className="mb-3 flex gap-2">
                  <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && comment.trim() && addComment.mutate()} placeholder="Add a comment or work note..." className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  <button onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending} className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  {(task.comments ?? []).map((c: any) => (
                    <div key={c.id} className="flex gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">{initials(c.user?.firstName, c.user?.lastName)}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500"><span className="font-semibold text-gray-800">{fullName(c.user)}</span> · {timeAgo(c.createdAt)}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{c.content}</p>
                      </div>
                    </div>
                  ))}
                  {!task.comments?.length && <p className="text-sm text-gray-400">No comments yet</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Description */}
          <Card className="card-premium">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-900">Description</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-gray-600">{task.description || 'No description provided.'}</p>
              {(task.workNote || task.deliverableUrl) && (
                <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                  {task.workNote && <p className="whitespace-pre-wrap text-gray-700">{task.workNote}</p>}
                  {task.deliverableUrl && (
                    <a href={task.deliverableUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-emerald-600 hover:underline">{task.deliverableUrl}</a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ============ LIGHT RIGHT SIDEBAR ============ */}
        <div className="space-y-5">
          {/* Task info */}
          <Card className="card-premium">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-900">Task Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-[11px] text-gray-400">Project</span><span className="font-medium text-gray-800">{task.project?.name ?? '—'}</span></div>
              <div className="flex items-center justify-between"><span className="text-[11px] text-gray-400">Due date</span><span className={`font-medium ${isOverdue(task.deadline, task.status) ? 'text-rose-600' : 'text-gray-800'}`}>{fmtDate(task.deadline)}</span></div>
              <div className="flex items-center justify-between"><span className="text-[11px] text-gray-400">Priority</span><PriorityBadge priority={task.priority} /></div>
              <div>
                <div className="mb-1 flex items-center justify-between"><span className="text-[11px] text-gray-400">Progress</span><span className="text-[11px] font-bold text-emerald-600">{task.progress ?? 0}%</span></div>
                <TaskProgressBar status={task.status} progress={task.progress} creativeStage={task.creativeStage} compact />
              </div>
            </CardContent>
          </Card>

          {/* Assignees */}
          <Card className="card-premium">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-900">Assigned To</CardTitle>
              {manager && (
                <button
                  type="button"
                  onClick={() => setAssignOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                >
                  <UserPlus className="h-3 w-3" /> {task.assignees?.length ? 'Change' : '+ Assign'}
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-2.5">
              {task.assignees?.length ? task.assignees.map((a: any) => (
                <div key={a.id} className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">{initials(a.user.firstName, a.user.lastName)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{fullName(a.user)}</p>
                    <p className="text-[11px] text-gray-400">{a.user.email}</p>
                  </div>
                </div>
              )) : <p className="text-sm text-gray-400">Unassigned</p>}

              {manager && assignOpen && (
                <div className="relative pt-1">
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                    {assignOptions.length === 0 && (
                      <p className="px-3 py-2.5 text-[12px] text-gray-400">No assignable employees found</p>
                    )}
                    {assignOptions.map((o) => {
                      const current = task.assignees?.some((a: any) => a.userId === o.id);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          disabled={assignTask.isPending}
                          onClick={() => assignTask.mutate(o.id)}
                          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-emerald-50/60 ${current ? 'bg-emerald-50/40' : ''}`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700">
                            {initials(o.name.split(' ')[0] ?? '', o.name.split(' ').slice(1).join(' '))}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-gray-800">{o.name}</span>
                            <span className="block truncate text-[10px] text-gray-400">{o.member ? 'Project team' : o.email}</span>
                          </span>
                          {current && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          {manager && !['completed', 'cancelled', 'approved'].includes(task.status) && (
            <Card className="card-premium">
              <CardContent className="flex gap-2 p-3">
                {task.status !== 'on_hold' ? (
                  <button onClick={() => setStatus.mutate('on_hold')} className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50">Put on Hold</button>
                ) : (
                  <button onClick={() => setStatus.mutate('todo')} className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50">Reopen</button>
                )}
                <button
                  onClick={() => { if (confirm(`Delete task "${task.title}"?`)) deleteTask.mutate(); }}
                  disabled={deleteTask.isPending}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Task
                </button>
              </CardContent>
            </Card>
          )}

          {/* Activity */}
          <Card className="card-premium">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2"><History className="h-4 w-4 text-emerald-600" /> Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-3">
                <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-100" />
                {(task.statusHistory ?? []).slice(0, 8).map((h: any) => (
                  <div key={h.id} className="relative flex gap-3 pl-5">
                    <span className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full bg-emerald-100 ring-2 ring-emerald-400" />
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
