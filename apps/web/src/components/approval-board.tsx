'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { fmtDate, isOverdue } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';
import { isManager } from '@/lib/roles';
import { Plus, X, Upload, Link2, Check, RotateCcw, Ban, PackageCheck, ExternalLink } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const COLUMNS = [
  { key: 'brief', label: 'Brief' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'internal_review', label: 'In Review' },
  { key: 'changes_requested', label: 'Changes' },
  { key: 'approved', label: 'Approved' },
  { key: 'delivered', label: 'Delivered' },
];

export function ApprovalBoard({ kind, title, subtitle }: { kind: 'creative' | 'video'; title: string; subtitle: string }) {
  const { user, role } = useAuth();
  const manager = isManager(role);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [versionNotes, setVersionNotes] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', brief: '', dimensions: '', format: '', requirements: '', sourceLink: '', priority: 'medium', deadline: '', assigneeId: '', departmentId: '' });

  const endpoint = kind === 'creative' ? '/creatives' : '/videos';

  const { data, isLoading } = useQuery({
    queryKey: [kind, status],
    queryFn: () => api.get(endpoint, { params: { ...(status !== 'all' ? { status } : {}), limit: 100 } }).then((r) => r.data),
  });
  const { data: detail } = useQuery({
    queryKey: [kind, 'detail', selected?.id],
    queryFn: () => api.get(`${endpoint}/${selected.id}`).then((r) => r.data),
    enabled: !!selected,
  });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then((r) => r.data) });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [kind] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const create = useMutation({
    mutationFn: () => api.post(endpoint, { ...form, deadline: form.deadline || undefined, assigneeId: form.assigneeId || undefined, departmentId: form.departmentId || undefined }),
    onSuccess: () => { invalidate(); setShowCreate(false); setForm({ title: '', brief: '', dimensions: '', format: '', requirements: '', sourceLink: '', priority: 'medium', deadline: '', assigneeId: '', departmentId: '' }); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed'),
  });

  const uploadVersion = useMutation({
    mutationFn: (file: File | null) => {
      const fd = new FormData();
      if (file) fd.append('file', file);
      if (versionNotes) fd.append('notes', versionNotes);
      if (externalUrl) fd.append('externalUrl', externalUrl);
      return api.post(`${endpoint}/${selected.id}/versions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { invalidate(); setVersionNotes(''); setExternalUrl(''); setError(''); },
    onError: (e: any) => setError(e.response?.data?.message || 'Upload failed'),
  });

  const review = useMutation({
    mutationFn: ({ versionId, action }: { versionId: string; action: 'approve' | 'reject' | 'changes' }) =>
      api.post(`${endpoint}/${selected.id}/versions/${versionId}/review`, { action, feedback }),
    onSuccess: () => { invalidate(); setFeedback(''); setError(''); },
    onError: (e: any) => setError(e.response?.data?.message || 'Review failed'),
  });

  const deliver = useMutation({
    mutationFn: () => api.post(`${endpoint}/${selected.id}/deliver`),
    onSuccess: invalidate,
  });

  const items: any[] = data?.items ?? [];
  const canUpload = (item: any) => manager || item?.assigneeId === user?.id;

  const fileUrl = (v: any) => (v.fileUrl ? `${API_BASE}${v.fileUrl}` : v.externalUrl);
  const isImage = (v: any) => (v.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(v.fileUrl ?? v.externalUrl ?? ''));
  const isVideo = (v: any) => (v.mimeType?.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(v.fileUrl ?? ''));

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight sm:text-[26px]">{title}</h1>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="grid gap-2 min-[480px]:flex min-[480px]:items-center">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm min-[480px]:w-auto">
            <option value="all">All statuses</option>
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <Button onClick={() => setShowCreate(true)} className="w-full gradient-brand-btn text-white border-0 rounded-xl min-[480px]:w-auto">
            <Plus className="h-4 w-4 mr-1" /> New Request
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-brand-500 animate-spin" /></div>
      ) : items.length === 0 ? (
        <Card className="card-premium"><CardContent className="py-14 text-center text-sm text-gray-400">No {kind} requests yet</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
          {items.map((item: any) => {
            const latest = item.versions?.[0];
            return (
              <Card key={item.id} className="card-premium cursor-pointer" onClick={() => setSelected(item)}>
                <CardContent className="p-5">
                  {latest && isImage(latest) && (
                    <img src={fileUrl(latest)} alt={item.title} className="mb-3 h-36 w-full rounded-lg object-cover bg-gray-100" />
                  )}
                  {latest && isVideo(latest) && (
                    <video src={fileUrl(latest)} className="mb-3 h-36 w-full rounded-lg object-cover bg-gray-900" muted />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{item.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.brief}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                    <PriorityBadge priority={item.priority} />
                    <span>{item._count?.versions ?? 0} version(s) · due {fmtDate(item.deadline)}</span>
                  </div>
                  {isOverdue(item.deadline, item.status) && <p className="mt-1 text-[11px] font-medium text-rose-600">Overdue</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-fade-in" onClick={() => setShowCreate(false)}>
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold">New {kind} request</h2>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); setError(''); create.mutate(); }} className="space-y-3.5">
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                <textarea value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} placeholder="Brief / description" rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                {kind === 'creative' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <input value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} placeholder="Dimensions (e.g. 1080x1080)" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                    <input value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} placeholder="Format (PNG, MP4...)" className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  </div>
                ) : (
                  <input value={form.sourceLink} onChange={(e) => setForm({ ...form, sourceLink: e.target.value })} placeholder="Source footage link (optional)" className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                )}
                <textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} placeholder="Requirements" rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                  <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                    <option value="">No department</option>
                    {(departments ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                    <option value="">Assign {kind === 'creative' ? 'designer' : 'editor'}...</option>
                    {(users ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
                {error && <p className="text-xs text-rose-600">{error}</p>}
                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit" disabled={create.isPending} className="flex-1 gradient-brand-btn text-white border-0 rounded-xl">{create.isPending ? 'Creating...' : 'Create request'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detail drawer */}
      {selected && detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{detail.title}</h2>
                <div className="mt-1.5 flex items-center gap-2"><StatusBadge status={detail.status} /><PriorityBadge priority={detail.priority} /></div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 space-y-1.5 text-sm text-gray-600">
              {detail.brief && <p><span className="font-medium text-gray-800">Brief:</span> {detail.brief}</p>}
              {detail.dimensions && <p><span className="font-medium text-gray-800">Dimensions:</span> {detail.dimensions}</p>}
              {detail.format && <p><span className="font-medium text-gray-800">Format:</span> {detail.format}</p>}
              {detail.sourceLink && <p><span className="font-medium text-gray-800">Source:</span> <a href={detail.sourceLink} target="_blank" rel="noreferrer" className="text-brand-600 underline">{detail.sourceLink}</a></p>}
              {detail.requirements && <p><span className="font-medium text-gray-800">Requirements:</span> {detail.requirements}</p>}
              <p><span className="font-medium text-gray-800">Deadline:</span> {fmtDate(detail.deadline)}</p>
            </div>

            {/* Upload version */}
            {canUpload(detail) && (
              <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700">Upload new version (v{(detail.versions?.[0]?.version ?? 0) + 1})</p>
                <div className="flex gap-2">
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600 hover:border-brand-300">
                    <Upload className="h-3.5 w-3.5" /> {uploadVersion.isPending ? 'Uploading...' : 'Choose file'}
                    <input type="file" accept={kind === 'video' ? 'video/*' : 'image/*,video/*'} className="hidden" onChange={(e) => e.target.files?.[0] && uploadVersion.mutate(e.target.files[0])} />
                  </label>
                  <span className="self-center text-xs text-gray-400">or</span>
                  <div className="flex flex-1 gap-1.5">
                    <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="External URL" className="flex-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs" />
                    <Button size="sm" variant="outline" onClick={() => uploadVersion.mutate(null)} disabled={!externalUrl}>Add</Button>
                  </div>
                </div>
                <input value={versionNotes} onChange={(e) => setVersionNotes(e.target.value)} placeholder="Version notes / revision description" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs" />
              </div>
            )}
            {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

            {/* Versions */}
            <div className="mt-6 space-y-4">
              <p className="text-sm font-semibold text-gray-900">Versions</p>
              {(detail.versions ?? []).map((v: any) => (
                <div key={v.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">v{v.version}</p>
                    <StatusBadge status={v.status} />
                  </div>
                  {isImage(v) && <img src={fileUrl(v)} alt={`v${v.version}`} className="mt-3 max-h-64 w-full rounded-lg object-contain bg-gray-50" />}
                  {isVideo(v) && <video src={fileUrl(v)} controls className="mt-3 max-h-64 w-full rounded-lg bg-gray-900" />}
                  {!isImage(v) && !isVideo(v) && (v.fileUrl || v.externalUrl) && (
                    <a href={fileUrl(v)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-xs text-brand-600">
                      <ExternalLink className="h-3.5 w-3.5" /> {v.fileName ?? v.externalUrl ?? 'Open file'}
                    </a>
                  )}
                  {v.notes && <p className="mt-2 text-xs text-gray-500 italic">"{v.notes}"</p>}
                  {v.feedback && (
                    <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-800">
                      <span className="font-semibold">Feedback:</span> {v.feedback}
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-gray-400">{v.fileName} · {v.reviewedAt ? `reviewed ${fmtDate(v.reviewedAt)}` : 'awaiting review'}</p>

                  {manager && v.status === 'submitted' && (
                    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback (required for changes/reject)" rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => review.mutate({ versionId: v.id, action: 'approve' })} disabled={review.isPending} className="gradient-brand-btn text-white border-0 rounded-lg"><Check className="h-3.5 w-3.5 mr-1" />Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => review.mutate({ versionId: v.id, action: 'changes' })} disabled={review.isPending} className="rounded-lg border-gray-200 text-gray-700"><RotateCcw className="h-3.5 w-3.5 mr-1" />Changes</Button>
                        <Button size="sm" variant="outline" onClick={() => review.mutate({ versionId: v.id, action: 'reject' })} disabled={review.isPending} className="rounded-lg border-rose-200 text-rose-600"><Ban className="h-3.5 w-3.5 mr-1" />Reject</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!detail.versions?.length && <p className="text-sm text-gray-400">No versions uploaded yet</p>}
            </div>

            {manager && detail.status === 'approved' && (
              <Button onClick={() => deliver.mutate()} disabled={deliver.isPending} className="mt-5 w-full gradient-brand-btn text-white border-0 rounded-xl">
                <PackageCheck className="h-4 w-4 mr-2" /> Mark as delivered
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
