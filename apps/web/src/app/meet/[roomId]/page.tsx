'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, PhoneOff,
  MessageSquare, Link2, Copy, Check, Loader2, AlertCircle, Send, X,
} from 'lucide-react';
import { LooplyLogo } from '@/components/LooplyLogo';
import { ZohoIcon } from '@/components/zoho-icon';
import { useAuth } from '@/lib/auth-context';
import { playNotificationChime } from '@/lib/sound';
import {
  RTC_CONFIG, myId, watchMeeting, watchParticipants, watchSignals, watchMessages,
  joinParticipant, leaveParticipant, sendSignal, sendChat, endMeeting, ensureMeetingDoc,
  type MeetingRoom, type Participant, type ChatMessage,
} from '@/lib/meet';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';

type Stage = 'lobby' | 'call';

interface Peer {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  presenting: boolean;
}

export default function MeetRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const uid = myId();

  const [stage, setStage] = useState<Stage>('lobby');
  const [room, setRoom] = useState<MeetingRoom | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [chatText, setChatText] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [guestName, setGuestName] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState('');
  const [camId, setCamId] = useState('');
  const [joining, setJoining] = useState(false);

  const peersRef = useRef<Map<string, Peer>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamVideoRef = useRef<MediaStreamTrack | null>(null);
  const iceQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const startedAt = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenSignals = useRef<Set<string>>(new Set());
  const remoteDescReady = useRef<Set<string>>(new Set());

  const displayName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
    : guestName.trim() || 'Guest';
  const myRole = user?.primaryRole ?? user?.roles?.[0] ?? 'Client';
  const isGuest = !user;
  const inviteLink = typeof window !== 'undefined' ? `${window.location.origin}/meet/${roomId}` : '';

  /* ---------------- Lobby media ---------------- */
  const startPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
        video: camId ? { deviceId: { exact: camId } } : true,
      });
      setLocalStream(stream);
      streamRef.current = stream;
      webcamVideoRef.current = stream.getVideoTracks()[0] ?? null;
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera/mic permission denied — allow access and retry.' : 'Could not access camera or microphone.');
    }
  }, [micId, camId]);

  useEffect(() => { void startPreview(); return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }; }, []);

  const toggleMic = () => {
    const s = streamRef.current; if (!s) return;
    const next = !micOn; setMicOn(next);
    s.getAudioTracks().forEach((t) => (t.enabled = next));
  };
  const toggleCam = () => {
    const s = streamRef.current; if (!s) return;
    const next = !camOn; setCamOn(next);
    s.getVideoTracks().forEach((t) => (t.enabled = next));
  };

  /* ---------------- Firestore listeners ---------------- */
  useEffect(() => { watchMeeting(roomId, setRoom); }, [roomId]);
  useEffect(() => {
    return watchParticipants(roomId, (list) => {
      const active = list.filter((p) => !(p as any).left);
      setParticipants(active);
      ensurePeers(active.filter((p) => p.id !== uid));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, stage]);
  useEffect(() => { return watchMessages(roomId, setMessages); }, [roomId]);

  useEffect(() => {
    return watchSignals(roomId, (sigs) => {
      for (const s of sigs) {
        if (s.to !== uid || seenSignals.current.has(s.id)) continue;
        seenSignals.current.add(s.id);
        void handleSignal(s.from, s.type, s.payload);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, stage]);

  useEffect(() => {
    if (!chatOpen && messages.length) setUnread((u) => u + 1);
  }, [messages.length, chatOpen]);

  useEffect(() => {
    if (chatOpen) setUnread(0);
  }, [chatOpen]);

  /* ---------------- WebRTC mesh ---------------- */
  const ensurePeers = useCallback((parts: Participant[]) => {
    if (stage !== 'call' || !streamRef.current) return;
    for (const p of parts) {
      if (p.id === uid || peersRef.current.has(p.id)) continue;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const peer: Peer = { pc, stream: null, presenting: false };
      peersRef.current.set(p.id, peer);

      streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) void sendSignal(roomId, uid, p.id, 'ice', e.candidate.toJSON());
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        peer.stream = stream;
        setParticipants((prev) => [...prev]); // re-render tiles
        attachRemoteAudio(p.id, stream);
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          peersRef.current.delete(p.id);
        }
      };
      // Deterministic initiator: lower participant id sends the offer
      if (uid < p.id) void createOffer(p.id, pc);
    }
  }, [stage, roomId, uid]);

  const createOffer = async (to: string, pc: RTCPeerConnection) => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(roomId, uid, to, 'offer', offer);
    } catch { /* ignore */ }
  };

  const flushIce = async (pid: string) => {
    const q = iceQueues.current.get(pid) ?? [];
    iceQueues.current.delete(pid);
    const peer = peersRef.current.get(pid);
    if (!peer) return;
    for (const c of q) await peer.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  };

  const handleSignal = async (from: string, type: string, payload: any) => {
    let peer = peersRef.current.get(from);
    if (!peer) {
      // Peer appeared via signal before participants listener — create lazily
      if (stage !== 'call' || !streamRef.current) return;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peer = { pc, stream: null, presenting: false };
      peersRef.current.set(from, peer);
      streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
      pc.onicecandidate = (e) => { if (e.candidate) void sendSignal(roomId, uid, from, 'ice', e.candidate.toJSON()); };
      pc.ontrack = (e) => {
        peer!.stream = e.streams[0] ?? new MediaStream([e.track]);
        attachRemoteAudio(from, peer!.stream);
        setParticipants((prev) => [...prev]);
      };
    }
    try {
      if (type === 'offer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(payload));
        remoteDescReady.current.add(from);
        await flushIce(from);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        await sendSignal(roomId, uid, from, 'answer', answer);
      } else if (type === 'answer') {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(payload));
        remoteDescReady.current.add(from);
        await flushIce(from);
      } else if (type === 'ice') {
        if (remoteDescReady.current.has(from)) {
          await peer.pc.addIceCandidate(new RTCIceCandidate(payload)).catch(() => {});
        } else {
          iceQueues.current.set(from, [...(iceQueues.current.get(from) ?? []), payload]);
        }
      }
    } catch { /* ignore renegotiation noise */ }
  };

  /* ---------------- Remote audio level rings ---------------- */
  const attachRemoteAudio = (pid: string, stream: MediaStream) => {
    try {
      const ctx = audioCtxRef.current ?? (audioCtxRef.current = new AudioContext());
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      peerAnalyserTick.current[pid] = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) * (v - 128);
        const rms = Math.min(1, Math.sqrt(sum / buf.length) / 40);
        setLevels((prev) => (Math.abs((prev[pid] ?? 0) - rms) > 0.02 ? { ...prev, [pid]: rms } : prev));
      };
    } catch { /* audio analysis unavailable */ }
  };
  const peerAnalyserTick = useRef<Record<string, () => void>>({});

  useEffect(() => {
    const id = setInterval(() => {
      for (const tick of Object.values(peerAnalyserTick.current)) tick();
    }, 200);
    return () => clearInterval(id);
  }, []);

  /* ---------------- Join / leave ---------------- */
  const join = async () => {
    if (isGuest && !guestName.trim()) { setError('Enter your name to join as a guest.'); return; }
    setJoining(true); setError('');
    try {
      await ensureMeetingDoc(roomId, { title: room?.title, projectId: room?.projectId, projectName: room?.projectName, hostName: room?.hostName });
      await joinParticipant(roomId, {
        id: uid, name: displayName, role: myRole, isGuest,
        cameraOn: camOn, micOn,
      });
      startedAt.current = Date.now();
      setStage('call');
    } catch (e: any) {
      setError('Could not join the meeting — Firestore may be unavailable.');
    } finally {
      setJoining(false);
    }
  };

  const cleanup = useCallback(async () => {
    peersRef.current.forEach((p) => { try { p.pc.close(); } catch { /* */ } });
    peersRef.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) void audioCtxRef.current.close().catch(() => {});
    if (levelTimer.current) clearInterval(levelTimer.current);
    await leaveParticipant(roomId, uid).catch(() => {});
    await endMeeting(roomId, startedAt.current).catch(() => {});
  }, [roomId, uid]);

  const leave = async () => {
    await cleanup();
    router.push('/meetings');
  };

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  /* ---------------- Screen share ---------------- */
  const toggleShare = async () => {
    if (sharing) {
      const screen = screenStreamRef.current;
      const cam = webcamVideoRef.current;
      peersRef.current.forEach((p) => {
        const sender = p.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender && cam) void sender.replaceTrack(cam).catch(() => {});
      });
      screen?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setSharing(false);
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      screenStreamRef.current = display;
      const vTrack = display.getVideoTracks()[0];
      if (!vTrack) return;
      peersRef.current.forEach((p) => {
        const sender = p.pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) void sender.replaceTrack(vTrack).catch(() => {});
      });
      vTrack.onended = () => { void toggleShareRef.current(); };
      setSharing(true);
      // mark presenter in participant doc
      void joinParticipant(roomId, { id: uid, name: displayName, role: myRole, isGuest, cameraOn: true, micOn }).catch(() => {});
    } catch { /* user cancelled */ }
  };
  const toggleShareRef = useRef(toggleShare);
  toggleShareRef.current = toggleShare;

  /* ---------------- Chat ---------------- */
  const sendMessage = async () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText('');
    await sendChat(roomId, { senderId: uid, senderName: displayName, senderRole: myRole, isGuest, text }).catch(() => {});
    if (!chatOpen) playNotificationChime(0.12);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  /* ---------------- Render helpers ---------------- */
  const remoteParticipants = participants.filter((p) => p.id !== uid && !(p as any).left);
  const allTiles = useMemo(() => {
    const list: { id: string; name: string; role: string; isGuest: boolean; isLocal: boolean; stream: MediaStream | null; level: number; presenting: boolean }[] = [];
    list.push({ id: uid, name: displayName, role: myRole, isGuest, isLocal: true, stream: localStream, level: micOn ? 0.15 : 0, presenting: sharing });
    for (const p of remoteParticipants) {
      const peer = peersRef.current.get(p.id);
      list.push({
        id: p.id, name: p.name, role: p.role, isGuest: p.isGuest, isLocal: false,
        stream: peer?.stream ?? null, level: levels[p.id] ?? 0, presenting: sharing && false,
      });
    }
    return list;
  }, [participants, remoteParticipants, localStream, displayName, myRole, isGuest, micOn, sharing, levels, uid]);

  const sharer = sharing ? uid : null;
  const gridCls = allTiles.length <= 1 ? 'grid-cols-1' : allTiles.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  /* ================= LOBBY ================= */
  if (stage === 'lobby') {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-[#0b1220] text-white">
        <header className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <LooplyLogo animate={true} size="sm" theme="dark" />
            <span className="text-sm font-bold tracking-wide">LOOPLY MEET</span>
          </div>
          <button onClick={() => router.back()} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10">
            ← Back
          </button>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 pb-10">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">{room?.title ?? room?.projectName ?? 'Client Meeting'}</h1>
            {room?.projectName && <p className="mt-1 text-sm text-slate-400">{room.projectName}</p>}
          </div>

          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-2xl">
            <video ref={(el) => { if (el && localStream) el.srcObject = localStream; }} autoPlay playsInline muted className="aspect-video w-full object-cover" />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 text-2xl font-bold text-emerald-300">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
              <button onClick={toggleMic} className={cn('flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition', micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-rose-500 text-white')}>
                {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>
              <button onClick={toggleCam} className={cn('flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition', camOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-rose-500 text-white')}>
                {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid w-full max-w-xl gap-3 sm:grid-cols-2">
            {isGuest && (
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Your name (guest)"
                className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder-slate-400 outline-none focus:border-emerald-400/60 sm:col-span-2"
              />
            )}
            <select value={micId} onChange={(e) => setMicId(e.target.value)} className="h-11 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-slate-200 outline-none">
              <option value="">Default microphone</option>
              {devices.filter((d) => d.kind === 'audioinput').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
            </select>
            <select value={camId} onChange={(e) => setCamId(e.target.value)} className="h-11 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-slate-200 outline-none">
              <option value="">Default camera</option>
              {devices.filter((d) => d.kind === 'videoinput').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
            </select>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          <button
            onClick={join}
            disabled={joining}
            className="flex h-12 w-full max-w-xl items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgba(16,185,129,0.6)] transition hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
          >
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {joining ? 'Joining…' : 'Join Meeting Now'}
          </button>
          <p className="text-xs text-slate-500">HD video • screen sharing • live chat — peer-to-peer, no downloads</p>
        </main>
      </div>
    );
  }

  /* ================= IN CALL ================= */
  return (
    <div className="flex h-dvh flex-col bg-[#0b1220] text-white">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-white/5 bg-slate-950/60 px-4 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <LooplyLogo animate={true} size="sm" theme="dark" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{room?.title ?? room?.projectName ?? 'Client Meeting'}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {remoteParticipants.length + 1} in meeting{room?.projectName ? ` • ${room.projectName}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyLink} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Link2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy Invite'}</span>
          </button>
          <div className="flex -space-x-2">
            {allTiles.slice(0, 4).map((t) => (
              <span key={t.id} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-950 bg-emerald-600 text-[10px] font-bold" title={t.name}>
                {t.name.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1">
        {sharing ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
              <MonitorUp className="h-3.5 w-3.5" /> You are sharing your screen
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3">
              {allTiles.map((t) => <Tile key={t.id} tile={t} large={t.id === uid} />)}
            </div>
          </div>
        ) : (
          <div className={cn('grid min-h-0 flex-1 gap-2 overflow-y-auto p-3', gridCls)}>
            {allTiles.map((t) => <Tile key={t.id} tile={t} large={allTiles.length === 1} />)}
          </div>
        )}

        {/* Chat drawer — desktop */}
        <AnimatePresence>
          {chatOpen && (
            <motion.aside
              initial={{ x: 340, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 340, opacity: 0 }}
              className="hidden w-80 shrink-0 flex-col border-l border-white/10 bg-slate-950/80 lg:flex xl:w-96"
            >
              <ChatPanel messages={messages} text={chatText} setText={setChatText} onSend={sendMessage} me={uid} onClose={() => setChatOpen(false)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile chat sheet */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col rounded-t-2xl border-t border-white/10 bg-slate-950/95 backdrop-blur lg:hidden">
            <ChatPanel messages={messages} text={chatText} setText={setChatText} onSend={sendMessage} me={uid} onClose={() => setChatOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control bar */}
      <footer className="border-t border-white/5 bg-slate-950/70 px-3 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 sm:gap-3">
          <CtrlBtn active={micOn} onClick={toggleMic} label={micOn ? 'Mute' : 'Unmute'}>
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </CtrlBtn>
          <CtrlBtn active={camOn} onClick={toggleCam} label={camOn ? 'Camera off' : 'Camera on'}>
            {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </CtrlBtn>
          <CtrlBtn active={sharing} onClick={() => void toggleShare()} label={sharing ? 'Stop share' : 'Share screen'} accent={sharing}>
            {sharing ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
          </CtrlBtn>
          <CtrlBtn onClick={copyLink} label="Copy invite">
            {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
          </CtrlBtn>
          <CtrlBtn onClick={() => setChatOpen((o) => !o)} label="Chat" badge={unread}>
            <MessageSquare className="h-5 w-5" />
          </CtrlBtn>
          <button
            onClick={() => void leave()}
            className="ml-1 flex h-11 items-center gap-2 rounded-full bg-rose-500 px-4 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-600"
          >
            <PhoneOff className="h-4 w-4" /> <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function Tile({ tile, large }: { tile: any; large?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && tile.stream) videoRef.current.srcObject = tile.stream;
  }, [tile.stream]);
  const ring = tile.level > 0.08;
  return (
    <div className={cn('relative overflow-hidden rounded-xl border bg-slate-900', large ? 'min-h-[40dvh]' : 'aspect-video', ring ? 'border-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.5)]' : 'border-white/10')}>
      {tile.stream?.getVideoTracks().some((t: any) => t.enabled) ? (
        <video ref={videoRef} autoPlay playsInline muted={tile.isLocal} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600/80 text-sm font-bold">{tile.name.slice(0, 2).toUpperCase()}</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 backdrop-blur">
        <span className="text-[11px] font-semibold">{tile.name}{tile.isLocal ? ' (You)' : ''}</span>
        <span className="rounded bg-white/10 px-1.5 py-px text-[9px] font-bold uppercase text-slate-300">{tile.role}</span>
        {tile.presenting && <MonitorUp className="h-3 w-3 text-emerald-400" />}
      </div>
      {tile.isLocal && !tile.stream?.getAudioTracks().some((t: any) => t.enabled) && (
        <div className="absolute right-2 top-2 rounded-md bg-rose-500/90 p-1"><MicOff className="h-3 w-3" /></div>
      )}
    </div>
  );
}

function CtrlBtn({ children, onClick, label, active = true, accent, badge }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean; accent?: boolean; badge?: number }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-full transition-all',
        accent ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-400' :
        active ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-rose-500/90 text-white hover:bg-rose-500',
      )}
    >
      {children}
      {badge ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold ring-2 ring-slate-950">{badge > 9 ? '9+' : badge}</span> : null}
    </button>
  );
}

function ChatPanel({ messages, text, setText, onSend, me, onClose }: { messages: ChatMessage[]; text: string; setText: (v: string) => void; onSend: () => void; me: string; onClose: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages.length]);
  return (
    <>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold"><MessageSquare className="h-4 w-4 text-emerald-400" /> In-meeting chat</p>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-white/10 lg:hidden"><X className="h-4 w-4" /></button>
      </div>
      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {messages.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No messages yet — say hello 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex flex-col', m.senderId === me ? 'items-end' : 'items-start')}>
            <div className={cn('max-w-[85%] rounded-xl px-3 py-2 text-[13px]', m.senderId === me ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-100')}>
              <p className="break-words">{renderText(m.text)}</p>
            </div>
            <p className="mt-0.5 px-1 text-[10px] text-slate-500">{m.senderName} • {timeAgo(m.createdAt?.toDate?.() ?? m.createdAt)}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="Type a message…"
            className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder-slate-400 outline-none focus:border-emerald-400/60"
          />
          <button onClick={onSend} className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-500">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

function renderText(text: string) {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRe).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="font-medium underline decoration-emerald-300/60 underline-offset-2">{part}</a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
