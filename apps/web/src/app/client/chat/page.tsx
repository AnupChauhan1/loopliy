'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  Paperclip,
  Phone,
  PhoneOff,
  Send,
  Video,
  VideoOff,
  Mic,
  MicOff,
  X,
} from 'lucide-react';
import api from '@/lib/api-client';
import { getSocket, connectSocket, isSocketReady } from '@/lib/socket';
import { CallSession } from '@/lib/call-session';
import { useAuth } from '@/lib/auth-context';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

type ChatUser = { id: string; firstName: string; lastName: string; avatar?: string | null; lastSeenAt?: string | null };
type Message = {
  id: string; conversationId: string; userId: string; content: string;
  attachments?: { url: string; name: string; mimeType?: string; size?: number }[] | null;
  editedAt?: string | null; deletedAt?: string | null; pinnedAt?: string | null;
  replyToId?: string | null;
  replyTo?: { id: string; content: string; deletedAt?: string | null; user?: { firstName: string; lastName: string } } | null;
  reads?: { userId: string }[];
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; avatar?: string | null };
};
type Conversation = {
  id: string; type: string; name?: string | null;
  client?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  members: { userId: string; user: ChatUser }[];
  peer?: ChatUser | null; memberCount: number;
  lastMessage?: { id: string; content: string; createdAt: string } | null;
  unreadCount: number; updatedAt: string;
};
type CallInfo = { callId: string; conversationId: string; type: 'audio' | 'video'; from?: ChatUser };

const name = (u?: { firstName?: string; lastName?: string } | null) =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Unknown' : 'Unknown';
const ini = (u?: { firstName?: string; lastName?: string } | null) =>
  `${u?.firstName?.[0] ?? ''}${u?.lastName?.[0] ?? ''}`.toUpperCase() || '?';

function Avatar({ user, size = 'md' }: { user?: { firstName?: string; lastName?: string; avatar?: string | null } | null; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-9 w-9 text-[10px]' : 'h-10 w-10 text-xs';
  return (
    <div className={`avatar ${cls} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700`}>
      {user?.avatar ? <img src={user.avatar.startsWith('http') ? user.avatar : `${API_URL}${user.avatar}`} alt="" className="h-full w-full object-cover" /> : ini(user)}
    </div>
  );
}

export default function ClientChatPage() {
  const { user } = useAuth() as any;
  const meId = user?.id as string;
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [incoming, setIncoming] = useState<CallInfo | null>(null);
  const [activeCall, setActiveCall] = useState<CallInfo | null>(null);
  const [callStatus, setCallStatus] = useState<'connecting' | 'active'>('connecting');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [peerStreams, setPeerStreams] = useState<Record<string, MediaStream | null>>({});
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [token, setToken] = useState<string | null>(null);
  const [wsReady, setWsReady] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem('auth_token'));
  }, []);

  const sessionRef = useRef<CallSession | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socket = useMemo(() => (token ? connectSocket(token) : getSocket()), [token]);
  const emit = useCallback((event: string, ...args: any[]) => {
    if (socket && isSocketReady(socket)) socket.emit(event, ...args);
  }, [socket]);

  // ---------- data ----------
  const conversations = useQuery<Conversation[]>({
    queryKey: ['client-chat-conversations'],
    queryFn: () => api.get('/chat/conversations').then((r) => r.data),
    refetchInterval: 15000,
  });
  // Clients only ever see their own portal conversations
  const clientConvos = useMemo(
    () => (conversations.data ?? []).filter((c) => c.type === 'client_portal'),
    [conversations.data],
  );
  useEffect(() => {
    if (!activeId && clientConvos.length > 0) setActiveId(clientConvos[0].id);
  }, [clientConvos, activeId]);

  const messages = useQuery<{ messages: Message[]; hasMore: boolean }>({
    queryKey: ['client-chat-messages', activeId],
    queryFn: () => api.get(`/chat/conversations/${activeId}/messages?take=50`).then((r) => r.data),
    enabled: !!activeId,
  });

  const activeConvo = clientConvos.find((c) => c.id === activeId) ?? null;

  // ---------- socket ----------
  useEffect(() => {
    if (!socket || !token) return;
    const onWsConnected = () => setWsReady(true);
    const onWsDisconnect = () => setWsReady(false);
    socket.on('connected', onWsConnected);
    socket.on('disconnect', onWsDisconnect);
    if (isSocketReady(socket)) setWsReady(true);

    const onMessage = (payload: { message: Message }) => {
      const m = payload.message;
      if (m.conversationId === activeId) {
        queryClient.setQueryData(['client-chat-messages', activeId], (old: any) => {
          if (!old) return old;
          if (old.messages.some((x: Message) => x.id === m.id)) return old;
          return { ...old, messages: [...old.messages, m] };
        });
        emit('chat:read', { conversationId: activeId });
      }
      queryClient.invalidateQueries({ queryKey: ['client-chat-conversations'] });
    };
    const onTyping = (p: { conversationId: string; userId: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (p.isTyping) next[p.userId] = p.conversationId;
        else if (next[p.userId] === p.conversationId) delete next[p.userId];
        return next;
      });
    };
    const onPresence = (p: { userId: string; online: boolean }) => setOnline((prev) => ({ ...prev, [p.userId]: p.online }));
    const onIncoming = (p: CallInfo) => { if (p.from?.id !== meId) setIncoming(p); };
    const onCallStatus = (p: { callId: string; status: string }) => {
      if (activeCall?.callId === p.callId && ['ended', 'missed', 'declined'].includes(p.status)) endCallLocal();
      if (incoming?.callId === p.callId && ['ended', 'declined', 'missed'].includes(p.status)) setIncoming(null);
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:message:dm', onMessage);
    socket.on('chat:typing', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('call:incoming', onIncoming);
    socket.on('call:status', onCallStatus);
    return () => {
      socket.off('connected', onWsConnected);
      socket.off('disconnect', onWsDisconnect);
      socket.off('chat:message', onMessage);
      socket.off('chat:message:dm', onMessage);
      socket.off('chat:typing', onTyping);
      socket.off('presence:update', onPresence);
      socket.off('call:incoming', onIncoming);
      socket.off('call:status', onCallStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, token, activeId, activeCall?.callId, incoming?.callId, meId]);

  useEffect(() => {
    if (!activeId || !wsReady) return;
    emit('chat:join', { conversationId: activeId });
    emit('chat:read', { conversationId: activeId });
    api.post(`/chat/conversations/${activeId}/read`).then(() =>
      queryClient.invalidateQueries({ queryKey: ['client-chat-conversations'] }),
    );
  }, [activeId, wsReady, emit, queryClient]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.data?.messages.length]);

  // ---------- actions ----------
  const sendMessage = useMutation({
    mutationFn: (payload: { content: string; attachments?: any[]; replyToId?: string }) =>
      api.post(`/chat/conversations/${activeId}/messages`, payload).then((r) => r.data),
    onSuccess: () => {
      setDraft(''); setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['client-chat-messages', activeId] });
      queryClient.invalidateQueries({ queryKey: ['client-chat-conversations'] });
    },
  });

  const startCall = (type: 'audio' | 'video') => {
    if (!activeConvo || !socket || !isSocketReady(socket)) return;
    const others = activeConvo.members.filter((m) => m.userId !== meId).map((m) => m.userId);
    socket.emit('call:start', { conversationId: activeId, type, participantIds: others }, (ack: any) => {
      if (!ack?.callId) return;
      const session = new CallSession({ callId: ack.callId, type, conversationId: activeId, localUserId: meId, socket });
      sessionRef.current = session;
      session.onPeerStream = (uid, stream) => setPeerStreams((p) => ({ ...p, [uid]: stream }));
      session.onPeerLeft = (uid) => setPeerStreams((p) => { const n = { ...p }; delete n[uid]; return n; });
      setPeerNames(Object.fromEntries(activeConvo.members.filter((m) => m.userId !== meId).map((m) => [m.userId, name(m.user)])));
      setActiveCall({ callId: ack.callId, conversationId: activeId, type });
      setCallStatus('connecting');
      session.startLocalMedia().then(() => {
        for (const uid of others) void session.addPeer(uid);
        setCallStatus('active');
      }).catch(() => setCallStatus('active'));
    });
  };

  const acceptCall = () => {
    const inc = incoming; setIncoming(null);
    if (!inc || !socket) return;
    const session = new CallSession({ callId: inc.callId, type: inc.type, conversationId: inc.conversationId, localUserId: meId, socket });
    sessionRef.current = session;
    session.onPeerStream = (uid, stream) => setPeerStreams((p) => ({ ...p, [uid]: stream }));
    session.onPeerLeft = (uid) => setPeerStreams((p) => { const n = { ...p }; delete n[uid]; return n; });
    const convo = clientConvos.find((c) => c.id === inc.conversationId);
    setPeerNames(Object.fromEntries((convo?.members ?? []).filter((m) => m.userId !== meId).map((m) => [m.userId, name(m.user)])));
    setActiveCall(inc); setCallStatus('connecting');
    emit('call:accept', { callId: inc.callId });
    session.startLocalMedia().then(async () => {
      const others = (convo?.members ?? []).filter((m) => m.userId !== meId).map((m) => m.userId);
      for (const uid of others) await session.addPeer(uid);
      setCallStatus('active');
    }).catch(() => setCallStatus('active'));
  };

  const endCallLocal = useCallback(() => {
    const session = sessionRef.current;
    if (session) { emit('call:end', { callId: session.callId }); session.destroy(); sessionRef.current = null; }
    setActiveCall(null); setCallStatus('connecting'); setPeerStreams({}); setMuted(false); setCameraOff(false); setCallSeconds(0);
  }, [emit]);

  const rejectCall = () => { if (incoming) emit('call:reject', { callId: incoming.callId }); setIncoming(null); };

  useEffect(() => {
    if (!activeCall || callStatus !== 'active') return;
    const t = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [activeCall, callStatus]);

  const toggleMute = () => setMuted((m) => { sessionRef.current?.setMuted(!m); return !m; });
  const toggleCamera = () => setCameraOff((c) => { sessionRef.current?.setCameraOff(!c); return !c; });

  const onType = (value: string) => {
    setDraft(value);
    if (!activeId) return;
    emit('chat:typing', { conversationId: activeId, isTyping: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emit('chat:typing', { conversationId: activeId, isTyping: false }), 2000);
  };

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/chat/upload', form);
      sendMessage.mutate({ content: draft.trim() || file.name, attachments: [res.data] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDay = (iso: string) => {
    const d = new Date(iso); const t = new Date(); const y = new Date(t); y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };
  const callTime = `${String(Math.floor(callSeconds / 60)).padStart(2, '0')}:${String(callSeconds % 60).padStart(2, '0')}`;
  const typingInActive = Object.entries(typingUsers).filter(([, cid]) => cid === activeId).map(([uid]) => uid);

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[480px] overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Conversation list (usually one portal conversation) */}
      <aside className={`w-full flex-col border-r border-gray-200 md:w-72 ${activeId ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <MessageCircle className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.isLoading && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
          {clientConvos.map((c) => {
            const staff = c.members.filter((m) => m.userId !== meId);
            const title = c.client?.name ?? c.project?.name ?? (staff[0] ? name(staff[0].user) : 'Team');
            const isActive = c.id === activeId;
            return (
              <button key={c.id} onClick={() => setActiveId(c.id)} className={`flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50 ${isActive ? 'bg-brand-50' : ''}`}>
                <Avatar user={staff[0]?.user} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-gray-900">{title}</p>
                  <p className="truncate text-[11px] text-gray-500">{c.lastMessage?.content || 'No messages yet'}</p>
                </div>
                {c.unreadCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">{c.unreadCount}</span>}
              </button>
            );
          })}
          {!conversations.isLoading && clientConvos.length === 0 && (
            <p className="p-4 text-center text-xs text-gray-400">Your team conversation will appear here.</p>
          )}
        </div>
      </aside>

      {/* Chat */}
      <section className={`min-w-0 flex-1 flex-col ${activeId ? 'flex' : 'hidden md:flex'}`}>
        {activeConvo ? (
          <>
            <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveId('')} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 md:hidden" aria-label="Back">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <Avatar user={activeConvo.members.find((m) => m.userId !== meId)?.user} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{activeConvo.client?.name ?? activeConvo.project?.name ?? 'Your LOOPLY team'}</p>
                  <p className="text-[11px] text-gray-500">
                    {typingInActive.length > 0 ? 'typing...' : `${activeConvo.memberCount - 1} team member${activeConvo.memberCount - 1 === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => startCall('audio')} title="Audio call" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-brand-700"><Phone className="h-5 w-5" /></button>
                <button onClick={() => startCall('video')} title="Video call" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-brand-700"><Video className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-gray-50/60 px-4 py-4">
              {(messages.data?.messages ?? []).map((m, idx) => {
                const mine = m.userId === meId;
                const showDay = idx === 0 || fmtDay((messages.data!.messages[idx - 1]).createdAt) !== fmtDay(m.createdAt);
                const seen = !mine && m.reads?.some((r) => r.userId !== meId);
                return (
                  <div key={m.id}>
                    {showDay && <p className="my-3 text-center text-[10px] font-medium uppercase tracking-wide text-gray-400">{fmtDay(m.createdAt)}</p>}
                    <div className={`group mb-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? 'bg-brand-600 text-white' : 'bg-white text-gray-800 ring-1 ring-gray-100'}`}>
                        {!mine && (
                          <p className="mb-0.5 text-[10px] font-semibold text-brand-700">{name(m.user)}</p>
                        )}
                        {m.replyTo && (
                          <div className={`mb-1 rounded-lg px-2 py-1 text-[11px] ${mine ? 'bg-brand-500/40' : 'bg-gray-100'}`}>
                            <span className="font-semibold">{name(m.replyTo.user)}: </span>
                            {m.replyTo.deletedAt ? 'message deleted' : m.replyTo.content}
                          </div>
                        )}
                        {m.deletedAt ? <p className="italic text-gray-400">This message was deleted</p> : <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {m.attachments.map((a, i) =>
                              a.mimeType?.startsWith('image/') ? (
                                <a key={i} href={`${API_URL}${a.url}`} target="_blank" rel="noreferrer">
                                  <img src={`${API_URL}${a.url}`} alt={a.name} className="max-h-56 rounded-lg object-cover" />
                                </a>
                              ) : a.mimeType?.startsWith('video/') ? (
                                <video key={i} src={`${API_URL}${a.url}`} controls className="max-h-56 rounded-lg" />
                              ) : (
                                <a key={i} href={`${API_URL}${a.url}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-1.5 text-[11px] font-medium underline-offset-2 hover:underline">
                                  <Paperclip className="h-3 w-3" /> {a.name}
                                </a>
                              ),
                            )}
                          </div>
                        )}
                        <div className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${mine ? 'text-brand-100' : 'text-gray-400'}`}>
                          {m.editedAt && <span>edited</span>}
                          <span>{fmtTime(m.createdAt)}</span>
                          {mine && (seen ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                        </div>
                      </div>
                      {!m.deletedAt && (
                        <button title="Reply" onClick={() => setReplyTo(m)} className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <MessageCircle className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {replyTo && (
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600">
                <span>Replying to <b>{name(replyTo.user)}</b>: {replyTo.content.slice(0, 60)}</span>
                <button onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button>
              </div>
            )}

            <form
              className="flex items-end gap-2 border-t border-gray-100 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft.trim();
                if (text) sendMessage.mutate({ content: text, replyToId: replyTo?.id });
              }}
            >
              <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach file" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <textarea
                value={draft}
                onChange={(e) => onType(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).form?.requestSubmit(); } }}
                rows={1}
                placeholder="Message your LOOPLY team..."
                className="max-h-32 min-h-[38px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              />
              <button type="submit" disabled={!draft.trim() || sendMessage.isPending} className="rounded-xl bg-brand-600 p-2.5 text-white hover:bg-brand-700 disabled:opacity-50">
                {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
            {typingInActive.length > 0 && (
              <p className="px-4 pb-1.5 text-[10px] text-gray-400">Your team is typing...</p>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-400">
            <MessageCircle className="h-10 w-10" />
            <p className="text-sm">Connecting you with your LOOPLY team...</p>
          </div>
        )}
      </section>

      {/* Incoming call */}
      {incoming && !activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
              <Avatar user={incoming.from} size="lg" />
            </div>
            <p className="text-lg font-semibold text-gray-900">{name(incoming.from)}</p>
            <p className="text-sm text-gray-500">Incoming {incoming.type} call...</p>
            <div className="mt-6 flex justify-center gap-4">
              <button onClick={rejectCall} className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600"><PhoneOff className="h-5 w-5" /></button>
              <button onClick={acceptCall} className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600">
                {incoming.type === 'video' ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active call */}
      {activeCall && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1220]">
          <div className="flex items-center justify-between px-6 py-4 text-white">
            <div>
              <p className="font-semibold">{callStatus === 'connecting' ? 'Connecting...' : callTime}</p>
              <p className="text-xs text-gray-400">{activeCall.type === 'video' ? 'Video call' : 'Audio call'}</p>
            </div>
            <button onClick={endCallLocal} className="rounded-full bg-rose-500 p-3 text-white hover:bg-rose-600"><PhoneOff className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-4 overflow-auto p-6">
            <div className="relative">
              <video ref={(el) => { if (el && sessionRef.current?.localStream) el.srcObject = sessionRef.current.localStream; }} autoPlay playsInline muted className={`rounded-xl bg-gray-800 object-cover ${activeCall.type === 'video' ? 'h-56 w-80' : 'hidden'}`} />
              {activeCall.type === 'audio' && <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white">{ini(user)}</div>}
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">You{muted ? ' (muted)' : ''}</span>
            </div>
            {Object.entries(peerStreams).map(([uid, stream]) => (
              <div key={uid} className="relative">
                <video ref={(el) => { if (el && stream) el.srcObject = stream; }} autoPlay playsInline className={`rounded-xl bg-gray-800 object-cover ${activeCall.type === 'video' ? 'h-56 w-80' : 'hidden'}`} />
                {activeCall.type === 'audio' && <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white">{ini({ firstName: peerNames[uid]?.split(' ')[0], lastName: peerNames[uid]?.split(' ')[1] })}</div>}
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">{peerNames[uid] ?? 'Team'}</span>
              </div>
            ))}
            {callStatus === 'connecting' && Object.keys(peerStreams).length === 0 && <p className="text-sm text-gray-400">Ringing your team...</p>}
          </div>
          <div className="flex items-center justify-center gap-4 pb-8">
            <button onClick={toggleMute} className={`rounded-full p-4 ${muted ? 'bg-white text-gray-900' : 'bg-white/15 text-white'} hover:bg-white/25`} title={muted ? 'Unmute' : 'Mute'}>
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            {activeCall.type === 'video' && (
              <button onClick={toggleCamera} className={`rounded-full p-4 ${cameraOff ? 'bg-white text-gray-900' : 'bg-white/15 text-white'} hover:bg-white/25`} title={cameraOff ? 'Camera on' : 'Camera off'}>
                {cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
