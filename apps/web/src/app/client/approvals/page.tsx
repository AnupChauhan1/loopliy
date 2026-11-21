'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileText, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import api from '@/lib/api-client';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

interface Deliverable {
  id: string;
  kind: 'creative' | 'video';
  title: string;
  description: string | null;
  deadline: string | null;
  projectName: string | null;
  latestVersion: {
    id: string; version: number; fileName: string | null; mimeType: string | null;
    externalUrl: string | null; notes: string | null; status: string;
    feedback: string | null; createdAt: string; downloadUrl: string;
  };
}
interface Dashboard { deliverables: Deliverable[] }

const statusLabel = (v?: string | null) => (v ? v.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : 'Pending');
const statusColor = (s: string) =>
  s === 'approved' ? 'bg-emerald-100 text-emerald-700' : s === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';

export default function ClientApprovalsPage() {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const dashboard = useQuery<Dashboard>({
    queryKey: ['client-portal-dashboard'],
    queryFn: () => api.get<Dashboard>('/client-portal/dashboard').then((r) => r.data),
  });
  const review = useMutation({
    mutationFn: (input: { kind: string; id: string; versionId: string; action: string; feedback?: string }) =>
      api.post(`/client-portal/deliverables/${input.kind}/${input.id}/versions/${input.versionId}/review`, {
        action: input.action,
        feedback: input.feedback,
      }),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['client-portal-dashboard'] });
    },
    onError: () => setError('Your review could not be submitted. Please try again.'),
  });

  const download = async (url: string, name: string) => {
    try {
      const { data } = await api.get(url, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError('This file could not be downloaded.');
    }
  };

  const items = dashboard.data?.deliverables ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Creative approvals</h1>
        <p className="mt-1 text-sm text-gray-500">Review deliverables from your LOOPLY team and approve, reject or request revisions.</p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {dashboard.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}
      {!dashboard.isLoading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No deliverables awaiting review. New creatives will appear here.
        </div>
      )}
      {items.map((d) => {
        const v = d.latestVersion;
        const mime = v.mimeType ?? '';
        const fileUrl = `${API_URL}${v.downloadUrl}`;
        const isImage = mime.startsWith('image/');
        const isVideo = mime.startsWith('video/');
        const isPdf = mime === 'application/pdf';
        return (
          <article key={`${d.kind}-${d.id}`} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50"><ShieldCheck className="h-5 w-5 text-brand-600" /></div>
                <div>
                  <h2 className="font-semibold text-gray-900">{d.title}</h2>
                  <p className="text-xs text-gray-500">{d.kind === 'video' ? 'Video' : 'Creative'} · v{v.version} · {d.projectName ?? 'General'} · {new Date(v.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor(v.status)}`}>{statusLabel(v.status)}</span>
            </div>
            {d.description && <p className="mt-3 text-sm text-gray-600">{d.description}</p>}
            {v.notes && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Team notes: {v.notes}</p>}

            {/* Preview */}
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
              {isImage && <img src={fileUrl} alt={v.fileName ?? d.title} className="max-h-96 w-full object-contain" />}
              {isVideo && <video src={fileUrl} controls className="max-h-96 w-full" />}
              {isPdf && <iframe src={fileUrl} className="h-96 w-full" title={d.title} />}
              {!isImage && !isVideo && !isPdf && (
                <div className="flex items-center gap-3 p-6">
                  <FileText className="h-8 w-8 text-gray-400" />
                  <div className="flex-1"><p className="text-sm font-medium text-gray-700">{v.fileName ?? 'Document'}</p><p className="text-xs text-gray-400">{mime || 'file'}</p></div>
                  <button onClick={() => download(v.downloadUrl, v.fileName ?? 'download')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    <Download className="mr-1 inline h-3.5 w-3.5" />Download
                  </button>
                </div>
              )}
            </div>
            {(isImage || isVideo || isPdf) && (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <Download className="h-3.5 w-3.5" />Open full version
              </a>
            )}

            {v.feedback && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Previous feedback: {v.feedback}</p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={feedback[d.id] ?? ''}
                onChange={(e) => setFeedback((f) => ({ ...f, [d.id]: e.target.value }))}
                placeholder="Feedback or revision notes (optional)"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  disabled={review.isPending}
                  onClick={() => review.mutate({ kind: d.kind, id: d.id, versionId: v.id, action: 'approve' })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />Approve
                </button>
                <button
                  disabled={review.isPending}
                  onClick={() => review.mutate({ kind: d.kind, id: d.id, versionId: v.id, action: 'changes', feedback: feedback[d.id] })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  <FileText className="h-4 w-4" />Request changes
                </button>
                <button
                  disabled={review.isPending}
                  onClick={() => review.mutate({ kind: d.kind, id: d.id, versionId: v.id, action: 'reject', feedback: feedback[d.id] })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />Reject
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
