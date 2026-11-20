'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Mic, Square, Upload, Play, Pause, RotateCcw, Trash2, Save, Loader2, FileAudio, AlertCircle } from 'lucide-react';
import {
  ACCEPTED_AUDIO, deleteCustomVoice, extensionFor, getCustomVoiceUrl, pickRecorderMime, recordingSupported,
  uploadCustomVoice, validateAudioFile, type CustomVoiceMeta,
} from '@/lib/custom-voice';

const MAX_RECORD_SECONDS = 20;

type Take = { blob: Blob; url: string; mime: string };

const apiError = (e: unknown, fallback: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** "Upload / Record My Voice": the user's own celebration recording, played exactly as recorded. */
export function MyVoiceRecorder({ voice, volume }: { voice: CustomVoiceMeta | null; volume: number }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [playing, setPlaying] = useState<'saved' | 'take' | null>(null);
  const [busy, setBusy] = useState<'upload' | 'delete' | 'load' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canRecord, setCanRecord] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setCanRecord(recordingSupported()), 0);
    return () => clearTimeout(t);
  }, []);

  // Release the microphone and blob URLs when leaving the page
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => () => { if (take) URL.revokeObjectURL(take.url); }, [take]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['preferences'] });

  const stopPlayback = () => {
    audioRef.current?.pause();
    setPlaying(null);
  };

  const play = async (which: 'saved' | 'take') => {
    const el = audioRef.current;
    if (!el) return;
    if (playing === which) return stopPlayback();
    setError('');
    try {
      let url = take?.url;
      if (which === 'saved') {
        setBusy('load');
        url = await getCustomVoiceUrl(voice!);
        setBusy(null);
      }
      el.src = url!;
      el.volume = volume;
      el.currentTime = 0;
      await el.play();
      setPlaying(which);
    } catch {
      setBusy(null);
      setError('Could not play the audio. Check your device volume and try again.');
    }
  };

  const startRecording = async () => {
    setError('');
    stopPlayback();
    if (!recordingSupported()) {
      setError('Recording needs a secure page (HTTPS or localhost) and microphone support. You can upload an audio file instead.');
      return;
    }
    try {
      // Processing turned off so the recording keeps your natural voice
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      stream.current = media;
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        stream.current = null;
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type });
        if (!blob.size) return setError('Nothing was recorded. Please try again.');
        setTake({ blob, url: URL.createObjectURL(blob), mime: type });
      };
      recorder.current = rec;
      rec.start(250);
      setTake(null);
      setSeconds(0);
      setRecording(true);
      const startedAt = Date.now();
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(s);
        if (s >= MAX_RECORD_SECONDS) stopRecording();
      }, 250);
    } catch (e) {
      setError((e as DOMException)?.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access in your browser and try again.' : 'Could not access a microphone on this device.');
    }
  };

  function stopRecording() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setRecording(false);
  }

  const saveTake = async () => {
    if (!take) return;
    stopPlayback();
    setBusy('upload');
    setError('');
    try {
      await uploadCustomVoice(take.blob, `my-celebration.${extensionFor(take.mime)}`);
      setTake(null);
      await refresh();
      flash('Your recording is saved. It will play every time you complete a task.');
    } catch (e) {
      setError(apiError(e, 'Upload failed. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    const invalid = validateAudioFile(file);
    if (invalid) return setError(invalid);
    stopPlayback();
    setBusy('upload');
    setError('');
    try {
      await uploadCustomVoice(file, file.name);
      setTake(null);
      await refresh();
      flash(voice ? 'Audio replaced.' : 'Audio uploaded. It will play every time you complete a task.');
    } catch (e) {
      setError(apiError(e, 'Upload failed. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete your celebration recording?')) return;
    stopPlayback();
    setBusy('delete');
    setError('');
    try {
      await deleteCustomVoice();
      await refresh();
      flash('Recording deleted.');
    } catch {
      setError('Could not delete the recording. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const disabled = !!busy || recording;

  return (
    <div id="my-voice" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Mic className="h-4 w-4 text-brand-600" /> Upload / Record My Voice</p>
        <p className="text-xs text-gray-500 mt-0.5">Your own recording plays exactly as recorded whenever you complete a task. MP3, WAV or WebM, up to 10 MB.</p>
      </div>

      <audio ref={audioRef} preload="none" playsInline onEnded={() => setPlaying(null)} onPause={() => setPlaying(null)} className="hidden" />

      {/* Saved recording */}
      {voice ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <FileAudio className="h-5 w-5 shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-800">{voice.originalName}</p>
            <p className="text-[11px] text-gray-500">{fmtSize(voice.size)} · saved {new Date(voice.updatedAt).toLocaleString()}</p>
          </div>
        </div>
      ) : (
        !take && !recording && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
            <span>No celebration recording yet. Record your voice or upload an audio file — until then, completing a task only shows the animation.</span>
          </div>
        )
      )}

      {/* Recording in progress */}
      {recording && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
          <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" /></span>
          <p className="flex-1 text-sm font-medium text-rose-800">Recording… {seconds}s / {MAX_RECORD_SECONDS}s</p>
          <Button size="sm" onClick={stopRecording} className="rounded-lg bg-rose-600 text-white hover:bg-rose-700"><Square className="h-3.5 w-3.5" /> Stop</Button>
        </div>
      )}

      {/* New take waiting for review */}
      {take && !recording && (
        <div className="rounded-xl border border-brand-200 bg-white px-3 py-2.5 space-y-2">
          <p className="text-sm font-medium text-gray-800">New recording ({seconds}s) — listen, then save it or record again.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => play('take')} className="rounded-lg">
              {playing === 'take' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {playing === 'take' ? 'Stop' : 'Play take'}
            </Button>
            <Button size="sm" onClick={saveTake} disabled={!!busy} className="gradient-brand-btn text-white border-0 rounded-lg">
              {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {voice ? 'Save & replace' : 'Save recording'}
            </Button>
            <Button size="sm" variant="outline" onClick={startRecording} disabled={!!busy} className="rounded-lg"><RotateCcw className="h-3.5 w-3.5" /> Re-record</Button>
            <Button size="sm" variant="outline" onClick={() => setTake(null)} disabled={!!busy} className="rounded-lg text-gray-600">Discard</Button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!take && !recording && (
        <div className="flex flex-wrap gap-2">
          {voice && (
            <Button size="sm" variant="outline" onClick={() => play('saved')} disabled={busy === 'upload' || busy === 'delete'} className="rounded-lg">
              {busy === 'load' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing === 'saved' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {playing === 'saved' ? 'Stop' : 'Play Preview'}
            </Button>
          )}
          {canRecord && (
            <Button size="sm" variant="outline" onClick={startRecording} disabled={disabled} className="rounded-lg">
              {voice ? <RotateCcw className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {voice ? 'Re-record' : 'Record'}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={disabled} className="rounded-lg">
            {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {voice ? 'Replace Audio' : 'Upload Audio'}
          </Button>
          {voice && (
            <Button size="sm" variant="outline" onClick={remove} disabled={disabled} className="rounded-lg text-rose-600 hover:bg-rose-50">
              {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete Audio
            </Button>
          )}
        </div>
      )}

      <input ref={fileInput} type="file" accept={ACCEPTED_AUDIO} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {!canRecord && (
        <p className="text-[11px] text-gray-500">Recording in the browser needs HTTPS (or localhost) and a microphone. You can still upload an MP3, WAV or WebM file.</p>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {notice && <p className="text-xs text-brand-700">{notice}</p>}
    </div>
  );
}
