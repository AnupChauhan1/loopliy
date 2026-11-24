'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { CelebrationBurst } from '@/components/ui/celebration';
import { useCompletionCelebration } from '@/lib/use-sound-prefs';
import { Loader2, Save } from 'lucide-react';

const DONE_STATUSES = ['completed', 'cancelled', 'approved'];

function selectValue(status: string) {
  if (status === 'completed' || status === 'approved') return 'completed';
  if (status === 'in_review') return 'submitted';
  if (['in_progress', 'changes_requested', 'on_hold'].includes(status)) return 'in_progress';
  return 'pending';
}

/**
 * Remote-work controls for an assigned task: status selector, live progress
 * slider, and a work note / deliverable link that managers and admins see
 * immediately. Set `readOnly` for manager inspection views.
 */
export function RemoteTaskControls({ task, readOnly = false }: { task: any; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const { celebrate, celebrating } = useCompletionCelebration();
  const [progress, setProgress] = useState(task.progress ?? 0);
  const [workNote, setWorkNote] = useState(task.workNote ?? '');
  const [deliverableUrl, setDeliverableUrl] = useState(task.deliverableUrl ?? '');
  const [error, setError] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setProgress(task.progress ?? 0);
    setWorkNote(task.workNote ?? '');
    setDeliverableUrl(task.deliverableUrl ?? '');
  }, [task.id, task.progress, task.workNote, task.deliverableUrl]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task', task.id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const onError = (e: any) => setError(e.response?.data?.message || 'Action failed');

  const advance = useMutation({
    mutationFn: async (value: string) => {
      if (value === 'pending') return api.post(`/tasks/${task.id}/status`, { status: 'todo' });
      const needsStart = ['todo', 'changes_requested', 'on_hold'].includes(task.status);
      if (value === 'in_progress') {
        if (needsStart) return api.post(`/tasks/${task.id}/start`);
        return api.post(`/tasks/${task.id}/status`, { status: 'in_progress' });
      }
      // 'submitted' / 'completed' go through the submit flow (backend decides review vs done)
      if (needsStart) await api.post(`/tasks/${task.id}/start`);
      return api.post(`/tasks/${task.id}/submit`, { note: workNote || undefined });
    },
    onSuccess: (r) => {
      invalidate();
      const data: any = r?.data;
      if (data && 'playCompletionSound' in data) {
        if (data.completed && data.playCompletionSound) celebrate('completed');
        else if (!data.completed) celebrate('submitted');
      }
    },
    onError,
  });

  const saveProgress = useMutation({
    mutationFn: (p: number) => api.post(`/tasks/${task.id}/progress`, { progress: p }),
    onSuccess: invalidate,
    onError,
  });

  const saveNote = useMutation({
    mutationFn: () =>
      api.put(`/tasks/${task.id}`, { workNote, deliverableUrl }).then((r) => r.data),
    onSuccess: invalidate,
    onError,
  });

  const handleStatus = (value: string) => {
    setError('');
    if (value === selectValue(task.status)) return;
    advance.mutate(value);
  };

  const queueProgressSave = (value: number) => {
    setProgress(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProgress.mutate(value), 600);
  };

  const busy = advance.isPending || saveProgress.isPending || saveNote.isPending;
  const finished = DONE_STATUSES.includes(task.status);

  if (readOnly) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Progress</span>
          <span className="font-semibold text-gray-800">{task.progress ?? 0}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 progress-fill" style={{ width: `${task.progress ?? 0}%` }} />
        </div>
        {(task.workNote || task.deliverableUrl) && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
            {task.workNote && <p className="whitespace-pre-wrap">{task.workNote}</p>}
            {task.deliverableUrl && (
              <a href={task.deliverableUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline break-all">
                {task.deliverableUrl}
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <CelebrationBurst active={celebrating} />
      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Status</span>
          <select
            value={selectValue(task.status)}
            disabled={busy || finished}
            onChange={(e) => handleStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="submitted">Submitted for Review</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Progress</span>
            <span className="text-xs font-semibold text-gray-800">{progress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            disabled={busy || finished}
            onChange={(e) => queueProgressSave(Number(e.target.value))}
            className="mt-2 w-full accent-brand-600 disabled:opacity-60"
          />
        </div>
      </div>

      {!finished && (
        <div className="space-y-2">
          <textarea
            value={workNote}
            onChange={(e) => setWorkNote(e.target.value)}
            placeholder="Remote work note / update for your manager..."
            rows={2}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={deliverableUrl}
              onChange={(e) => setDeliverableUrl(e.target.value)}
              placeholder="Deliverable link (Drive, Figma, live URL...)"
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveNote.mutate()}
              disabled={busy || (workNote === (task.workNote ?? '') && deliverableUrl === (task.deliverableUrl ?? ''))}
              className="rounded-xl border-gray-200"
            >
              {saveNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
