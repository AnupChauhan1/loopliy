'use client';

import api from './api-client';

/** The user's own celebration recording, played as-is with HTML5 Audio (no speech synthesis). */
export interface CustomVoiceMeta {
  mimeType: string;
  size: number;
  originalName: string;
  updatedAt: string;
}

export const MAX_VOICE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_AUDIO = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/webm,.mp3,.wav,.webm';
const ACCEPTED_EXT = /\.(mp3|wav|webm)$/i;
const ACCEPTED_MIME = /^audio\/(mpeg|mp3|wav|x-wav|wave|vnd\.wave|webm)$/i;

/** Client-side check before uploading (the server re-validates the actual file bytes). */
export function validateAudioFile(file: File): string | null {
  if (!ACCEPTED_MIME.test(file.type) && !ACCEPTED_EXT.test(file.name)) return 'Please choose an MP3, WAV or WebM audio file.';
  if (file.size > MAX_VOICE_BYTES) return 'Audio file must be 10 MB or smaller.';
  if (file.size === 0) return 'This file is empty.';
  return null;
}

export const voiceKey = (meta: CustomVoiceMeta) => `${meta.updatedAt}|${meta.size}`;

let cached: { key: string; url: string } | null = null;

/** Downloads the recording through the authenticated API (it is not publicly reachable) and caches it as a blob URL. */
export async function getCustomVoiceUrl(meta: CustomVoiceMeta): Promise<string> {
  const key = voiceKey(meta);
  if (cached?.key === key) return cached.url;
  const res = await api.get('/preferences/voice/audio', { responseType: 'blob' });
  if (cached) URL.revokeObjectURL(cached.url);
  cached = { key, url: URL.createObjectURL(res.data as Blob) };
  return cached.url;
}

export function clearCustomVoiceCache() {
  if (cached) URL.revokeObjectURL(cached.url);
  cached = null;
}

// One shared element: mobile browsers only allow script-started playback on an element
// that has already been played once inside a user gesture.
let player: HTMLAudioElement | null = null;
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function getPlayer() {
  if (!player) {
    player = new Audio();
    player.preload = 'auto';
    player.setAttribute('playsinline', '');
  }
  return player;
}

let unlockInstalled = false;
/** Primes the shared audio element on the first tap/click/key so the recording can play after an async task update. */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  const unlock = () => {
    events.forEach((ev) => window.removeEventListener(ev, unlock, true));
    const p = getPlayer();
    if (!p.paused) return;
    if (!p.src) p.src = SILENT_WAV;
    p.muted = true;
    p.play().then(() => p.pause()).catch(() => {}).finally(() => { p.muted = false; });
  };
  events.forEach((ev) => window.addEventListener(ev, unlock, true));
}

export function stopCustomVoice() {
  if (player && !player.paused) player.pause();
}

/** Plays the exact uploaded recording. Resolves when it finishes; rejects if the browser blocks playback. */
export async function playCustomVoice(meta: CustomVoiceMeta, volume: number): Promise<void> {
  const url = await getCustomVoiceUrl(meta);
  const p = getPlayer();
  p.pause();
  if (p.src !== url) p.src = url;
  p.currentTime = 0;
  p.muted = false;
  p.volume = Math.min(1, Math.max(0, volume));
  await p.play();
  await new Promise<void>((resolve) => {
    const events = ['ended', 'pause', 'error'] as const;
    const done = () => {
      events.forEach((ev) => p.removeEventListener(ev, done));
      resolve();
    };
    events.forEach((ev) => p.addEventListener(ev, done));
  });
}

/** Picks a MediaRecorder format the current browser supports (WebM on Chrome/Firefox/Android, MP4 on Safari/iOS). */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
}

export function recordingSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export const extensionFor = (mime: string) => (/mp4/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : /mpeg|mp3/.test(mime) ? 'mp3' : 'webm');

export function uploadCustomVoice(file: Blob, name: string) {
  const fd = new FormData();
  fd.append('file', file, name);
  return api
    .post('/preferences/voice', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data.voice as CustomVoiceMeta);
}

export function deleteCustomVoice() {
  clearCustomVoiceCache();
  return api.delete('/preferences/voice');
}
