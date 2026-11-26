'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Check, ChevronRight, ClipboardPaste, Loader2, MessageCircle, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fullName } from '@/lib/format';
import { useAuth } from '@/lib/auth-context';

const STAGES = [
  { n: 1, label: 'Created Design', hint: 'Design/video/creative ready' },
  { n: 2, label: 'Strategist Review', hint: 'Internal strategist approves' },
  { n: 3, label: 'Client Review', hint: 'Sent to client for approval' },
  { n: 4, label: 'Posted', hint: 'Live — task auto-completes' },
];

const NEXT_LABEL: Record<number, string> = {
  0: 'Mark as Created Design',
  1: 'Submit for Strategist Review →',
  2: 'Send for Client Review →',
  3: 'Mark as Posted ✓',
};

export function CreativeApprovalPanel({ task, onChanged }: { task: any; onChanged?: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteMsg, setPasteMsg] = useState('');
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [error, setError] = useState('');

  const stage: number = task.creativeStage ?? 0;
  const done = stage >= 4;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', task.id] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    onChanged?.();
  };

  const setStage = useMutation({
    mutationFn: (body: any) => api.post(`/tasks/${task.id}/creative-stage`, body).then((r) => r.data),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.response?.data?.message || 'Stage update failed'),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/tasks/${task.id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { invalidate(); setPasteMsg('Screenshot attached ✓'); setTimeout(() => setPasteMsg(''), 2500); },
    onError: (e: any) => setError(e.response?.data?.message || 'Upload failed'),
  });

  const logComment = useMutation({
    mutationFn: (content: string) => api.post(`/tasks/${task.id}/comments`, { content }),
    onSuccess: invalidate,
  });

  const handleFiles = (files: FileList | File[] | null) => {
    const f = files?.[0];
    if (!f) return;
    if (f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/') || f.type === 'application/pdf' || f.size < 30 * 1024 * 1024) {
      upload.mutate(f);
    } else {
      setError('Please paste or upload an image, video, audio or PDF file.');
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) { e.preventDefault(); handleFiles([f]); return; }
      }
    }
  };

  const sendWhatsApp = () => {
    const project = task.project?.name ?? 'No project';
    const stageName = STAGES[Math.min(stage, 3)]?.label ?? 'Not started';
    const link = typeof window !== 'undefined' ? `${window.location.origin}/tasks/${task.id}` : '';
    const text = encodeURIComponent(
      `🔔 *LOOPLY — Approval Needed*\n\n` +
      `*Project:* ${project}\n` +
      `*Task:* ${task.title}${task.taskNumber ? ` (${task.taskNumber})` : ''}\n` +
      `*Stage:* ${stageName}\n` +
      `*Deliverable:* ${task.deliverableUrl ?? 'See attachments in LOOPLY'}\n` +
      `*Review & approve:* ${link}\n\n_Reply here or use the link to approve._`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
    logComment.mutate(`📲 Important WhatsApp Alert sent — "${STAGES[Math.min(stage, 3)]?.label}" stage • ${project}`);
  };

  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/60 to-white p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-gray-900">Creative Approval Pipeline</p>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
          {done ? 'Posted ✓' : `Stage ${stage}/4`}
        </span>
      </div>

      {/* Stepper */}
      <div className="mb-4 flex items-start">
        {STAGES.map((s, i) => {
          const reached = stage >= s.n;
          const current = stage === s.n - 1 || (stage === s.n && !done);
          return (
            <div key={s.n} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center">
                <span className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ring-2 transition',
                  reached ? 'bg-emerald-500 text-white ring-emerald-300' : 'bg-white text-gray-400 ring-gray-200',
                )}>
                  {reached ? <Check className="h-3.5 w-3.5" /> : s.n}
                </span>
                <span className={cn('mt-1.5 max-w-[72px] text-center text-[9px] font-semibold leading-tight', reached ? 'text-emerald-700' : 'text-gray-400')}>
                  {s.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={cn('mx-1 mt-3 h-0.5 flex-1 rounded-full', stage > s.n ? 'bg-emerald-400' : 'bg-gray-200')} />
              )}
            </div>
          );
        })}
      </div>

      {/* Paste / upload dropzone */}
      {!done && (
        <div
          onPaste={onPaste}
          onClick={() => fileRef.current?.click()}
          className="group mb-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-emerald-300/70 bg-white/70 px-4 py-4 text-center transition hover:border-emerald-400 hover:bg-emerald-50/60"
        >
          {upload.isPending ? <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> : <ClipboardPaste className="h-5 w-5 text-emerald-600" />}
          <p className="text-xs font-semibold text-gray-700">Paste Screenshot <span className="font-normal text-gray-400">(Ctrl+V)</span> or Upload</p>
          <p className="text-[10px] text-gray-400"> attaches to this task&apos;s deliverables</p>
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {pasteMsg && <p className="mb-2 text-center text-[11px] font-semibold text-emerald-700">{pasteMsg}</p>}
      {error && <p className="mb-2 text-center text-[11px] font-medium text-rose-600">{error}</p>}

      {/* Stage actions */}
      {!done && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={setStage.isPending}
            onClick={() => setStage.mutate({ stage: stage + 1 })}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-[13px] font-semibold text-white shadow-[0_6px_16px_-4px_rgba(5,150,105,0.4)] transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
          >
            {setStage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            {NEXT_LABEL[stage] ?? 'Advance stage'}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={sendWhatsApp}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366]/10 text-[12px] font-semibold text-[#128C7E] ring-1 ring-[#25D366]/40 transition hover:bg-[#25D366]/20"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Alert
            </button>
            <button
              type="button"
              onClick={() => setRevisionOpen((v) => !v)}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-[12px] font-semibold text-rose-600 transition hover:bg-rose-100"
            >
              <XCircle className="h-3.5 w-3.5" /> Request Revision
            </button>
          </div>

          {revisionOpen && (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
              <input
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="What needs to change?"
                className="h-9 w-full rounded-lg border border-rose-200 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-rose-300"
              />
              <button
                type="button"
                disabled={!revisionNote.trim() || setStage.isPending}
                onClick={() => { setStage.mutate({ action: 'revision', note: revisionNote }); setRevisionNote(''); setRevisionOpen(false); }}
                className="h-9 w-full rounded-lg bg-rose-600 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                Send Revision Request
              </button>
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="rounded-xl bg-emerald-100/70 px-3 py-2.5 text-center">
          <p className="text-xs font-bold text-emerald-800">🎉 Posted — task completed at 100%</p>
          <p className="mt-0.5 text-[10px] text-emerald-600">Full approval pipeline finished</p>
        </div>
      )}

      {(task.attachments?.length ?? 0) > 0 && (
        <p className="mt-3 text-center text-[10px] text-gray-400">{task.attachments.length} deliverable{task.attachments.length === 1 ? '' : 's'} attached</p>
      )}
    </div>
  );
}
