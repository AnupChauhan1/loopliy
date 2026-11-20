'use client';

/**
 * Task celebration sounds.
 *
 * - Completion plays the user's own uploaded recording (see custom-voice.ts) — no speech synthesis or AI voice.
 * - The chime (bell arpeggio + reverb, synthesized with Web Audio) is used for submissions and as the
 *   fallback when no recording has been uploaded yet.
 */

export type CelebrationKind = 'completed' | 'submitted';

/* ---------------- Chime ---------------- */
function impulse(ctx: AudioContext, seconds = 1.8, decay = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function bell(ctx: AudioContext, out: AudioNode, freq: number, at: number, gain: number) {
  // Enhanced bell-like inharmonic partials with richer harmonics: [ratio, relative gain, decay seconds]
  const partials: [number, number, number][] = [
    [1, 1, 2.2],      // fundamental
    [2.0, 0.48, 1.4], // second harmonic
    [2.76, 0.32, 1.1], // inharmonic partial (bell characteristic)
    [4.0, 0.18, 0.8], // upper harmonic
    [5.4, 0.14, 0.55], // bright shimmer
    [8.2, 0.08, 0.35], // high-frequency sparkle
  ];
  for (const [ratio, g, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain * g, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
}

/** A short, playful rising "party horn" sweep. */
function whoop(ctx: AudioContext, out: AudioNode, at: number) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, at);
  osc.frequency.exponentialRampToValueAtTime(1200, at + 0.2);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.22, at + 0.03);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 0.26);
}

export function playChime(volume: number, kind: CelebrationKind): Promise<void> {
  return new Promise((resolve, reject) => {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return reject(new Error('Audio not supported'));
    const ctx: AudioContext = new Ctx();
    const t = ctx.currentTime + 0.02;

    const master = ctx.createGain();
    // Kept under the voice so the opening "BOOOOOOOHOOOOOOOO!" is clearly audible over the chime
    master.gain.value = Math.min(1, Math.max(0, volume)) * (kind === 'completed' ? 0.35 : 0.55);
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx);
    dry.connect(master);
    wet.connect(reverb).connect(master);

    const bus = ctx.createGain();
    bus.connect(dry);
    bus.connect(wet);

    // completed: party-horn "whoop" + fast rising arpeggio with a double final hit; submitted: gentle two-note G–C
    let start = t;
    if (kind === 'completed') {
      whoop(ctx, bus, t);
      start = t + 0.22;
    }
    const notes = kind === 'completed' ? [784.0, 1046.5, 1318.5, 1568.0, 2093.0, 2093.0] : [1568.0, 2093.0];
    const step = kind === 'completed' ? 0.085 : 0.11;
    notes.forEach((f, i) => bell(ctx, bus, f, start + i * step, i >= notes.length - 2 ? 0.5 : 0.36));

    const total = start - t + (notes.length - 1) * step + 1.9;
    ctx.resume().catch(() => {});
    setTimeout(() => {
      ctx.close().catch(() => {});
      resolve();
    }, total * 1000);
  });
}

export interface SoundPrefs {
  soundEnabled: boolean;
  soundVolume: number;
  submissionSound: boolean;
  globalSoundEnabled: boolean;
}

export function shouldPlay(prefs: SoundPrefs | undefined): boolean {
  return !!prefs && prefs.globalSoundEnabled !== false && prefs.soundEnabled !== false;
}

export function volumeOf(prefs: SoundPrefs | undefined): number {
  return ((prefs?.soundVolume ?? 70) / 100);
}
