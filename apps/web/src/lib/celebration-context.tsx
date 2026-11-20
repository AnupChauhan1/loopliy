'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { playChime, type CelebrationKind } from './sound';
import { installAudioUnlock, playCustomVoice, type CustomVoiceMeta } from './custom-voice';
import Celebration from '../components/celebration';

export interface CelebrationOptions {
  /** Play audio (default true). */
  sound?: boolean;
  volume?: number;
  /** The user's uploaded recording; completion plays it as-is. */
  customVoice?: CustomVoiceMeta | null;
}

interface CelebrationContextType {
  /** Shows the animation and plays audio. Resolves false if the browser blocked playback. */
  triggerCelebration: (kind?: CelebrationKind, options?: CelebrationOptions) => Promise<boolean>;
}

export interface ActiveCelebration {
  id: number;
  kind: CelebrationKind;
  /** Completed without an uploaded recording: ask the user to record/upload one. */
  missingVoice: boolean;
}

const CelebrationContext = createContext<CelebrationContextType | undefined>(undefined);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveCelebration | null>(null);
  const nextId = useRef(0);

  useEffect(() => installAudioUnlock(), []);

  const triggerCelebration = useCallback(async (kind: CelebrationKind = 'completed', options: CelebrationOptions = {}) => {
    const { sound = true, volume = 0.7, customVoice = null } = options;
    const missingVoice = kind === 'completed' && !customVoice;
    setActive({ id: ++nextId.current, kind, missingVoice });
    if (!sound || volume <= 0) return true;
    try {
      // Completion plays the user's own recording; the chime is only for submissions / no recording yet
      if (kind === 'completed' && customVoice) await playCustomVoice(customVoice, volume);
      else await playChime(volume, kind);
      return true;
    } catch {
      // Playback blocked by the browser — the visual celebration still shows
      return false;
    }
  }, []);

  const handleComplete = useCallback(() => setActive(null), []);
  const value = useMemo(() => ({ triggerCelebration }), [triggerCelebration]);

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      <Celebration celebration={active} onComplete={handleComplete} />
    </CelebrationContext.Provider>
  );
}

export function useCelebration() {
  const context = useContext(CelebrationContext);
  if (!context) {
    throw new Error('useCelebration must be used within CelebrationProvider');
  }
  return context;
}
