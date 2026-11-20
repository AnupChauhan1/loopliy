'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useCompletionCelebration } from '@/lib/use-sound-prefs';
import { CelebrationBurst } from '@/components/ui/celebration';
import { Play, Send, Percent, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { isManager } from '@/lib/roles';

/** Start / progress / submit actions for an assigned task. */
export function TaskActions({ task, compact = false }: { task: any; compact?: boolean }) {
  const queryClient = useQueryClient();
  const { celebrate, celebrating } = useCompletionCelebration();
  const [progressValue, setProgressValue] = useState(task.progress ?? 0);
  const [note, setNote] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const [error, setError] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task', task.id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const start = useMutation({
    mutationFn: () => api.post(`/tasks/${task.id}/start`),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.response?.data?.message || 'Failed to start'),
  });

  const progress = useMutation({
    mutationFn: (p: number) => api.post(`/tasks/${task.id}/progress`, { progress: p }),
    onSuccess: () => { invalidate(); setShowProgress(false); },
    onError: (e: any) => setError(e.response?.data?.message || 'Failed'),
  });

  const submit = useMutation({
    mutationFn: () => api.post(`/tasks/${task.id}/submit`, { note }).then((r) => r.data),
    onSuccess: (data) => {
      invalidate();
      setNote('');
      // The completion voice only plays when the backend confirms true completion
      if (data.completed && data.playCompletionSound) celebrate('completed');
      else if (!data.completed) celebrate('submitted');
    },
    onError: (e: any) => setError(e.response?.data?.message || 'Submit failed'),
  });

  const busy = start.isPending || progress.isPending || submit.isPending;

  if (!['todo', 'in_progress', 'changes_requested', 'on_hold'].includes(task.status)) return null;

  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'space-y-3'}>
      <CelebrationBurst active={celebrating} />
      {error && <p className="text-xs text-rose-600 w-full">{error}</p>}

      {['todo', 'changes_requested', 'on_hold'].includes(task.status) && (
        <Button
          size={compact ? 'sm' : 'default'}
          onClick={() => start.mutate()}
          disabled={busy}
          className="gradient-brand-btn text-white border-0 rounded-xl shadow-md shadow-brand-500/20"
        >
          {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {task.status === 'changes_requested' ? 'Restart work' : 'Start task'}
        </Button>
      )}

      {task.status === 'in_progress' && !compact && (
        <>
          {showProgress ? (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progressValue}
                onChange={(e) => setProgressValue(Number(e.target.value))}
                className="flex-1 accent-brand-600"
              />
              <span className="text-sm font-medium text-gray-700 w-10">{progressValue}%</span>
              <Button size="sm" onClick={() => progress.mutate(progressValue)} disabled={busy} className="rounded-lg">
                Save
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowProgress(true)} className="rounded-xl border-gray-200">
              <Percent className="h-4 w-4" /> Update progress
            </Button>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Work note (optional)"
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <Button
              onClick={() => submit.mutate()}
              disabled={busy}
              className="gradient-brand-btn text-white border-0 rounded-xl shadow-md shadow-brand-500/20"
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {task.requiresApproval ? 'Submit for review' : 'Complete task'}
            </Button>
          </div>
        </>
      )}

      {task.status === 'in_progress' && compact && (
        <Button
          size="sm"
          onClick={() => submit.mutate()}
          disabled={busy}
          className="gradient-brand-btn text-white border-0 rounded-xl"
          title={task.requiresApproval ? 'Submit for review' : 'Complete task'}
        >
          {submit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}

/** Reviewer actions (approve / request changes) for managers on in_review tasks. */
export function ReviewActions({ task }: { task: any }) {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const review = useMutation({
    mutationFn: (action: 'approve' | 'changes') =>
      api.post(`/tasks/${task.id}/review`, { action, feedback }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', task.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setFeedback('');
    },
    onError: (e: any) => setError(e.response?.data?.message || 'Review failed'),
  });

  if (!isManager(role) || task.status !== 'in_review') return null;

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback (required when requesting changes)"
        rows={2}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => review.mutate('approve')}
          disabled={review.isPending}
          className="gradient-brand-btn text-white border-0 rounded-xl"
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => review.mutate('changes')}
          disabled={review.isPending}
          className="rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Request changes
        </Button>
      </div>
    </div>
  );
}
