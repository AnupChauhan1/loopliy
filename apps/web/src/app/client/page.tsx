'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Download, FileText, FolderKanban, Loader2, MessageCircle, Send, XCircle } from 'lucide-react';
import api from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { connectSocket } from '@/lib/socket';

interface PortalMilestone {
  id: string;
  name: string;
  description: string | null;
  dueDate: string;
  status: string;
}

interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  deadline: string | null;
  milestones: PortalMilestone[];
}

interface PortalTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  deadline: string | null;
  project: { id: string; name: string } | null;
  statusHistory: Array<{ id: string; fromStatus: string; toStatus: string; changedAt: string }>;
}

interface PortalDeliverable {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  deadline: string | null;
  projectName: string | null;
  latestVersion: {
    id: string;
    version: number;
    fileName: string | null;
    mimeType: string | null;
    externalUrl: string | null;
    notes: string | null;
    status: string;
    feedback: string | null;
    createdAt: string;
    downloadUrl: string;
  };
}

interface PortalFile {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  project: { name: string };
  downloadUrl: string;
}

interface PortalMessage {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  user: { firstName: string; lastName: string };
}

interface ClientDashboard {
  client: { id: string; name: string };
  projects: PortalProject[];
  tasks: PortalTask[];
  deliverables: PortalDeliverable[];
  files: PortalFile[];
}

const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not set';

const statusLabel = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Pending';

export default function ClientDashboardPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState('');

  const dashboard = useQuery<ClientDashboard>({
    queryKey: ['client-portal-dashboard'],
    queryFn: () => api.get<ClientDashboard>('/client-portal/dashboard').then((response) => response.data),
  });
  const messages = useQuery<PortalMessage[]>({
    queryKey: ['client-portal-messages'],
    queryFn: () => api.get<PortalMessage[]>('/client-portal/messages').then((response) => response.data),
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) => api.post('/client-portal/messages', { content }),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['client-portal-messages'] });
    },
  });

  // Real-time delivery of staff replies via the chat gateway.
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const socket = connectSocket(token);
    const onDm = (payload: { message: PortalMessage & { userId: string } }) => {
      if (!payload?.message?.id) return;
      queryClient.setQueryData<PortalMessage[]>(['client-portal-messages'], (old) => {
        const list = old ?? [];
        if (list.some((m) => m.id === payload.message.id)) return list;
        return [...list, payload.message];
      });
    };
    socket.on('chat:message:dm', onDm);
    return () => {
      socket.off('chat:message:dm', onDm);
    };
  }, [queryClient]);
  const review = useMutation({
    mutationFn: (input: { kind: string; id: string; versionId: string; action: 'approve' | 'reject' | 'changes'; feedback?: string }) =>
      api.post(`/client-portal/deliverables/${input.kind}/${input.id}/versions/${input.versionId}/review`, {
        action: input.action,
        feedback: input.feedback,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-portal-dashboard'] }),
  });

  const download = async (id: string, url: string, name: string) => {
    setDownloading(id);
    setDownloadError('');
    try {
      const { data } = await api.get(url, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError('This file could not be downloaded. Please contact your project team.');
    } finally {
      setDownloading('');
    }
  };

  if (dashboard.isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  }
  if (dashboard.isError) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">We could not load your client dashboard. Please refresh or contact your team.</div>;
  }
  if (!dashboard.data) return null;

  const data = dashboard.data;
  const projects = data.projects;
  const tasks = data.tasks;
  const deliverables = data.deliverables;
  const files = data.files;

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">Client workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Welcome, {data.client.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">A secure overview of your projects, tasks and deliverables.</p>
        </div>
        <div className="text-sm text-gray-500">{projects.length} active project{projects.length === 1 ? '' : 's'}</div>
      </section>

      {downloadError && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{downloadError}</p>}
      {review.isError && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">Your review could not be submitted. Refresh the page and try again.</p>}

      <section>
        <div className="mb-3 flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
        </div>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">Your team has not assigned a project yet.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <article key={project.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{project.name}</h3>
                    {project.description && <p className="mt-1 text-sm text-gray-500">{project.description}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{statusLabel(project.status)}</span>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-gray-500"><span>Progress</span><span>{project.progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }} />
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-500">Target date: {dateLabel(project.deadline)}</p>
                {project.milestones?.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Milestones</p>
                    <ul className="space-y-2">
                      {project.milestones.map((milestone) => (
                        <li key={milestone.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-gray-700">{milestone.name}</span>
                          <span className="shrink-0 text-xs text-gray-500">{statusLabel(milestone.status)} · {dateLabel(milestone.dueDate)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Shared task updates</h2>
        </div>
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">There are no task updates shared with you yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {tasks.map((task) => (
              <article key={task.id} className="border-b border-gray-100 p-4 last:border-b-0 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-gray-900">{task.title}</h3>
                    <p className="mt-1 text-xs text-gray-500">{task.project?.name} · {statusLabel(task.status)}</p>
                  </div>
                  <span className="text-xs text-gray-500">Due {dateLabel(task.deadline)}</span>
                </div>
                {task.description && <p className="mt-2 text-sm text-gray-600">{task.description}</p>}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }} />
                </div>
                {task.statusHistory?.length > 0 && (
                  <p className="mt-2 text-xs text-gray-400">Last update {dateLabel(task.statusHistory[0].changedAt)}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Deliverables & approvals</h2>
        </div>
        {deliverables.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">New deliverables will appear here when your team shares them.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {deliverables.map((item) => {
              const version = item.latestVersion;
              const reviewable = version.status === 'submitted';
              const reviewKey = `${item.kind}-${item.id}`;
              return (
                <article key={reviewKey} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-brand-700">{item.kind} · Version {version.version}</p>
                      <h3 className="mt-1 font-semibold text-gray-900">{item.title}</h3>
                      <p className="mt-1 text-xs text-gray-500">{item.projectName ?? 'Shared deliverable'} · Due {dateLabel(item.deadline)}</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{statusLabel(version.status)}</span>
                  </div>
                  {item.description && <p className="mt-3 text-sm text-gray-600">{item.description}</p>}
                  {version.notes && <p className="mt-2 text-sm text-gray-500">{version.notes}</p>}
                  {version.feedback && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Feedback: {version.feedback}</p>}
                  {version.externalUrl && (
                    <a href={version.externalUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                      <FileText className="h-4 w-4" /> Open deliverable
                    </a>
                  )}
                  {!version.externalUrl && (
                    <button
                      type="button"
                      onClick={() => download(reviewKey, version.downloadUrl, version.fileName || `${item.title}-v${version.version}`)}
                      disabled={downloading === reviewKey}
                      className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline disabled:opacity-50"
                    >
                      {downloading === reviewKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Download deliverable
                    </button>
                  )}
                  {reviewable && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <label className="mb-1.5 block text-xs font-medium text-gray-600" htmlFor={`feedback-${reviewKey}`}>Feedback (required for changes or rejection)</label>
                      <textarea
                        id={`feedback-${reviewKey}`}
                        value={feedback[reviewKey] ?? ''}
                        onChange={(event) => setFeedback((previous) => ({ ...previous, [reviewKey]: event.target.value }))}
                        rows={2}
                        maxLength={2000}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        placeholder="Share your feedback with the team"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={review.isPending}
                          onClick={() => review.mutate({ kind: item.kind, id: item.id, versionId: version.id, action: 'approve', feedback: feedback[reviewKey] })}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" /> Approve
                        </button>
                        <button
                          type="button"
                          disabled={review.isPending || !feedback[reviewKey]?.trim()}
                          onClick={() => review.mutate({ kind: item.kind, id: item.id, versionId: version.id, action: 'changes', feedback: feedback[reviewKey] })}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Request changes
                        </button>
                        <button
                          type="button"
                          disabled={review.isPending || !feedback[reviewKey]?.trim()}
                          onClick={() => review.mutate({ kind: item.kind, id: item.id, versionId: version.id, action: 'reject', feedback: feedback[reviewKey] })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Project files</h2>
        </div>
        {files.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">Project files shared by your team will appear here.</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white">
            {files.map((file) => (
              <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{file.project.name} · Added {dateLabel(file.createdAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={downloading === file.id}
                  onClick={() => download(file.id, file.downloadUrl, file.name)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {downloading === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Team messages</h2>
              <p className="text-sm text-gray-500">Send questions and feedback directly to your project team.</p>
            </div>
          </div>
          <a href="/client/chat" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100">
            Open chat
          </a>
        </div>
        {messages.isError && <p className="mb-3 text-sm text-rose-600">Messages could not be loaded.</p>}
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg bg-gray-50 p-3 sm:p-4">
          {(messages.data ?? []).length === 0 && <p className="py-4 text-center text-sm text-gray-500">Start a conversation with your team.</p>}
          {(messages.data ?? []).map((entry) => (
            <div key={entry.id} className={`max-w-[90%] rounded-xl px-3 py-2.5 ${entry.userId === user?.id ? 'ml-auto bg-brand-600 text-white' : 'bg-white text-gray-800 shadow-sm'}`}>
              <p className="mb-1 text-[11px] opacity-75">{entry.user.firstName} {entry.user.lastName} · {dateLabel(entry.createdAt)}</p>
              <p className="whitespace-pre-wrap text-sm">{entry.content}</p>
            </div>
          ))}
        </div>
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim()) sendMessage.mutate(message.trim());
          }}
        >
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Write a message..."
            className="min-w-0 flex-1 resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <button type="submit" disabled={!message.trim() || sendMessage.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
        {sendMessage.isError && <p className="mt-2 text-sm text-rose-600">Your message could not be sent. Please try again.</p>}
      </section>
    </div>
  );
}
