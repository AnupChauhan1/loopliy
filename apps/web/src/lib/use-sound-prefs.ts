'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect } from 'react';
import api from '@/lib/api-client';
import { shouldPlay, volumeOf, type CelebrationKind, type SoundPrefs } from '@/lib/sound';
import { getCustomVoiceUrl, type CustomVoiceMeta } from '@/lib/custom-voice';
import { useCelebration } from './celebration-context';

export type Preferences = SoundPrefs & { brandName: string; customVoice: CustomVoiceMeta | null };

export function useSoundPrefs() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get('/preferences').then((r) => r.data as Preferences),
    staleTime: 60000,
  });
}

export function useUpdatePrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SoundPrefs>) => api.put('/preferences', data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  });
}

export function useCompletionCelebration() {
  const { data: prefs } = useSoundPrefs();
  const { triggerCelebration } = useCelebration();
  const [celebrating, setCelebrating] = useState(false);
  const customVoice = prefs?.customVoice ?? null;

  // Download the recording ahead of time so it starts instantly when a task completes
  useEffect(() => {
    if (customVoice) getCustomVoiceUrl(customVoice).catch(() => {});
  }, [customVoice]);

  const celebrate = useCallback(
    async (kind: CelebrationKind = 'completed') => {
      if (kind === 'submitted' && (!shouldPlay(prefs) || !prefs?.submissionSound)) return;
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 1600);
      // Completing a task always gets the visual party; audio follows the user's sound settings
      await triggerCelebration(kind, { sound: shouldPlay(prefs), volume: volumeOf(prefs), customVoice });
    },
    [prefs, customVoice, triggerCelebration],
  );

  /** Settings preview: always audible (ignores the on/off toggle) at the chosen volume. */
  const preview = useCallback(
    (kind: CelebrationKind = 'completed') => triggerCelebration(kind, { volume: volumeOf(prefs), customVoice }),
    [prefs, customVoice, triggerCelebration],
  );

  return { celebrate, preview, celebrating, enabled: shouldPlay(prefs), prefs, customVoice };
}
