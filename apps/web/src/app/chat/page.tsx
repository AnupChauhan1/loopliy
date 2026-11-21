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
  Pin,
  PhoneOff,
  Search,
  Send,
  Trash2,
  Users,
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

type ChatUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string | null;
  lastSeenAt?: string | null;
  isActive?: boolean;
  department?: { id: string; name: string; color?: string } | null;
  roleNames?: string[];
  roles?: { id: string; name: string }[];
};

type Message = {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  attachments?: { url: string; name: string; mimeType?: string; size?: number }[] | null;
  readAt?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  replyToId?: string | null;
  replyTo?: { id: string; content: string; deletedAt?: string | null; user?: { firstName: string; lastName: string } } | null;
  reads?: { userId: string }[];
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; avatar?: string | null };
};

type Conversation = {
  id: string;
  type: string;
  name?: string | null;
  client?: { id: string; name: string; email?: string | null } | null;
  project?: { id: string; name: string; status?: string } | null;
  members: { userId: string; role?: string | null; user: ChatUser }[];
  peer?: ChatUser | null;
  memberCount: number;
  lastMessage?: { id: string; content: string; createdAt: string; sender?: { firstName: string; lastName: string } } | null;
  unreadCount: number;
  updatedAt: string;
};

type CallInfo = {
  callId: string;
  conversationId: string;
  type: 'audio' | 'video';
  from?: ChatUser;
};

function displayName(u?: { firstName?: string; lastName?: string } | null) {
  return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Unknown' : 'Unknown';
}

function initials(u?: { firstName?: string; lastName?: string } | null) {
  return `${u?.firstName?.[0] ?? ''}${u?.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

function convoTitle(c: Conversation, meId: string) {
  if (c.type === 'client_portal' && c.client) return c.client.name;
  if (c.project) return c.project.name;
  if (c.name) return c.name;
  if (c.peer) return displayName(c.peer);
  const others = c.members.filter((m) => m.userId !== meId);
  return others.slice(0, 2).map((m) => displayName(m.user)).join(', ') + (others.length > 2 ? ` +${others.length - 2}` : '');
}

function Avatar({ user, size = 'md' }: { user?: { firstName?: string; lastName?: string; avatar?: string | null } | null; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-10 w-10 text-xs';
  return (
    <div className={`avatar ${cls} shrink-0 overflow-hidden rounded-full bg-brand-100 text-brand-700`}>
      {user?.avatar ? (
        <img src={user.avatar.startsWith('http') ? user.avatar : `${API_URL}${user.avatar}`} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(user)
      )}
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth() as any;
  const meId = user?.id as string;
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState('');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
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
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) setActiveId(c);
  }, []);

  const sessionRef = useRef<CallSession | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socket = useMemo(() => (token ? connectSocket(token) : getSocket()), [token]);

  const emit = useCallback((event: string, ...args: any[]) => {
    if (socket && isSocketReady(socket)) socket.emit(event, ...args);
  }, [socket]);

  // ---------- queries ----------
  const conversations = useQuery<Conversation[]>({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get('/chat/conversations').then((r) => r.data),
    refetchInterval: 15000,
  });

  const messages = useQuery<{ messages: Message[]; hasMore: boolean }>({
    queryKey: ['chat-messages', activeId],
    queryFn: () => api.get(`/chat/conversations/${activeId}/messages?take=50`).then((r) => r.data),
    enabled: !!activeId,
  });

  const chatUsers = useQuery<ChatUser[]>({
    queryKey: ['chat-users', search],
    queryFn: () => api.get('/chat/users', { params: { q: search || undefined } }).then((r) => r.data),
    enabled: showNew,
  });

  // ---------- socket wiring ----------
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
        queryClient.setQueryData(['chat-messages', activeId], (old: any) => {
          if (!old) return old;
          if (old.messages.some((x: Message) => x.id === m.id)) return old;
          return { ...old, messages: [...old.messages, m] };
        });
        emit('chat:read', { conversationId: activeId });
      }
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    };
    const onDm = (payload: { message: Message }) => {
      // Message for a conversation we may not have joined — refresh lists.
      if (payload.message.conversationId !== activeId) {
        queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      }
    };
    const onTyping = (p: { conversationId: string; userId: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (p.isTyping) next[p.userId] = p.conversationId;
        else if (next[p.userId] === p.conversationId) delete next[p.userId];
        return next;
      });
    };
    const onPresence = (p: { userId: string; online: boolean }) => {
      setOnline((prev) => ({ ...prev, [p.userId]: p.online }));
    };
    const onIncoming = (p: CallInfo) => {
      if (p.from?.id === meId) return;
      setIncoming(p);
      // auto-play ringtone could go here
    };
    const onCallSignal = () => {}; // handled inside CallSession
    const onCallStatus = (p: { callId: string; status: string; userId?: string }) => {
      if (activeCall?.callId === p.callId) {
        if (p.status === 'ended' || p.status === 'missed' || p.status === 'declined') {
          endCallLocal();
        }
      }
      if (incoming?.callId === p.callId && (p.status === 'ended' || p.status === 'declined' || p.status === 'missed')) {
        setIncoming(null);
      }
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:message:dm', onDm);
    socket.on('chat:typing', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('call:incoming', onIncoming);
    socket.on('call:status', onCallStatus);
    socket.on('call:signal', onCallSignal);

    return () => {
      socket.off('connected', onWsConnected);
      socket.off('disconnect', onWsDisconnect);
      socket.off('chat:message', onMessage);
      socket.off('chat:message:dm', onDm);
      socket.off('chat:typing', onTyping);
      socket.off('presence:update', onPresence);
      socket.off('call:incoming', onIncoming);
      socket.off('call:status', onCallStatus);
      socket.off('call:signal', onCallSignal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, token, activeId, activeCall?.callId, incoming?.callId, meId]);

  // join conversation room + mark read
  useEffect(() => {
    if (!activeId || !wsReady) return;
    emit('chat:join', { conversationId: activeId });
    emit('chat:read', { conversationId: activeId });
    api.post(`/chat/conversations/${activeId}/read`).then(() => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    });
  }, [activeId, wsReady, emit, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.data?.messages.length]);

  // ---------- derived ----------
  const activeConvo = conversations.data?.find((c) => c.id === activeId) ?? null;
  const filteredConvos = useMemo(() => {
    const list = conversations.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c) => convoTitle(c, meId).toLowerCase().includes(q) || (c.lastMessage?.content ?? '').toLowerCase().includes(q));
  }, [conversations.data, search, meId]);

  const typingInActive = Object.entries(typingUsers)
    .filter(([, cid]) => cid === activeId)
    .map(([uid]) => uid);

  // ---------- actions ----------
  const sendMessage = useMutation({
    mutationFn: (payload: { content: string; attachments?: any[]; replyToId?: string }) =>
      api.post(`/chat/conversations/${activeId}/messages`, payload).then((r) => r.data),
    onSuccess: () => {
      setDraft('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeId] });
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });

  const createDirect = useMutation({
    mutationFn: (userId: string) => api.post('/chat/conversations/direct', { userId }).then((r) => r.data),
    onSuccess: (data) => {
      setShowNew(false);
      setActiveId(data.id);
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });

  const createGroup = useMutation({
    mutationFn: (data: { name: string; memberIds: string[] }) =>
      api.post('/chat/conversations/group', data).then((r) => r.data),
    onSuccess: (data) => {
      setShowNew(false);
      setActiveId(data.id);
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });

  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<Set<string>>(new Set());

  const startCall = async (type: 'audio' | 'video') => {
    if (!activeConvo || !socket || !isSocketReady(socket)) return;
    const others = activeConvo.members.filter((m) => m.userId !== meId).map((m) => m.userId);
    socket.emit('call:start', { conversationId: activeId, type, participantIds: others }, (ack: any) => {
      if (ack?.callId) {
        const session = new CallSession({ callId: ack.callId, type, conversationId: activeId, localUserId: meId, socket });
        sessionRef.current = session;
        session.onPeerStream = (uid, stream) => setPeerStreams((p) => ({ ...p, [uid]: stream }));
        session.onPeerLeft = (uid) => setPeerStreams((p) => { const n = { ...p }; delete n[uid]; return n; });
        setPeerNames(Object.fromEntries(activeConvo.members.filter((m) => m.userId !== meId).map((m) => [m.userId, displayName(m.user)])));
        setActiveCall({ callId: ack.callId, conversationId: activeId, type });
        setCallStatus('connecting');
        session.startLocalMedia().then(() => {
          for (const uid of others) void session.addPeer(uid);
          setCallStatus('active');
        }).catch(() => {
          // mic/cam denied
          setCallStatus('active');
        });
      }
    });
  };

  const acceptCall = async () => {
    const inc = incoming;
    setIncoming(null);
    if (!inc || !socket) return;
    // Create the session first so call:signal listeners are bound before
    // the caller starts sending offers.
    const session = new CallSession({ callId: inc.callId, type: inc.type, conversationId: inc.conversationId, localUserId: meId, socket });
    sessionRef.current = session;
    session.onPeerStream = (uid, stream) => setPeerStreams((p) => ({ ...p, [uid]: stream }));
    session.onPeerLeft = (uid) => setPeerStreams((p) => { const n = { ...p }; delete n[uid]; return n; });
    const convo = conversations.data?.find((c) => c.id === inc.conversationId);
    setPeerNames(Object.fromEntries((convo?.members ?? []).filter((m) => m.userId !== meId).map((m) => [m.userId, displayName(m.user)])));
    setActiveCall(inc);
    setCallStatus('connecting');
    emit('call:accept', { callId: inc.callId });
    session.startLocalMedia().then(async () => {
      const others = (convo?.members ?? []).filter((m) => m.userId !== meId).map((m) => m.userId);
      for (const uid of others) await session.addPeer(uid);
      setCallStatus('active');
    }).catch(() => setCallStatus('active'));
  };

  const rejectCall = () => {
    if (incoming) emit('call:reject', { callId: incoming.callId });
    setIncoming(null);
  };

  const endCallLocal = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      emit('call:end', { callId: session.callId });
      session.destroy();
      sessionRef.current = null;
    }
    setActiveCall(null);
    setCallStatus('connecting');
    setPeerStreams({});
    setMuted(false);
    setCameraOff(false);
    setCallSeconds(0);
  }, [socket, emit]);

  useEffect(() => {
    if (!activeCall || callStatus !== 'active') return;
    const t = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [activeCall, callStatus]);

  const toggleMute = () => {
    setMuted((m) => { sessionRef.current?.setMuted(!m); return !m; });
  };
  const toggleCamera = () => {
    setCameraOff((c) => { sessionRef.current?.setCameraOff(!c); return !c; });
  };

  const onType = (value: string) => {
    setDraft(value);
    if (!activeId || !socket) return;
      emit('chat:typing', { conversationId: activeId, isTyping: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emit('chat:typing', { conversationId: activeId, isTyping: false }), 2000);
  };

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/chat/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      sendMessage.mutate({ content: draft.trim() || file.name, attachments: [res.data] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doEdit = () => {
    if (!editing) return;
    api.patch(`/chat/messages/${editing.id}`, { content: draft.trim() }).then(() => {
      setEditing(null);
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeId] });
    });
  };

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDay = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString();
  };

  const callSecondsStr = `${String(Math.floor(callSeconds / 60)).padStart(2, '0')}:${String(callSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[560px] overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Sidebar — hidden on mobile while a conversation is open */}
      <aside className={`w-full flex-col border-r border-gray-200 md:w-80 ${activeId ? 'hidden md:flex' : 'flex'}`}>
        <div className="border-b border-gray-100 p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <MessageCircle className="h-4 w-4 text-brand-600" /> Chat
            </h2>
            <button onClick={() => setShowNew(true)} className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
              New
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats..." className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:border-brand-400 focus:outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.isLoading && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
          {filteredConvos.map((c) => {
            const title = convoTitle(c, meId);
            const isActive = c.id === activeId;
            const peerId = c.peer?.id;
            const isOnline = peerId ? online[peerId] : undefined;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-center gap-3 border-b border-gray-50 px-3 py-2.5 text-left hover:bg-gray-50 ${isActive ? 'bg-brand-50' : ''}`}
              >
                <div className="relative">
                  <Avatar user={c.peer ?? c.members.find((m) => m.userId !== meId)?.user} size="sm" />
                  {peerId && isOnline !== undefined && (
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-gray-900">{title}</p>
                    {c.lastMessage && <span className="shrink-0 text-[10px] text-gray-400">{fmtTime(c.lastMessage.createdAt)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] text-gray-500">{c.lastMessage ? c.lastMessage.content : 'No messages yet'}</p>
                    {c.unreadCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">{c.unreadCount}</span>}
                  </div>
                </div>
              </button>
            );
          })}
          {!conversations.isLoading && filteredConvos.length === 0 && (
            <p className="p-4 text-center text-xs text-gray-400">No conversations yet — start a new chat.</p>
          )}
        </div>
      </aside>

      {/* Chat area — on mobile only shown when a conversation is selected */}
      <section className={`min-w-0 flex-1 flex-col ${activeId ? 'flex' : 'hidden md:flex'}`}>
        {activeConvo ? (
          <>
            <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveId('')} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 md:hidden" aria-label="Back to chats">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <Avatar user={activeConvo.peer ?? activeConvo.members.find((m) => m.userId !== meId)?.user} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{convoTitle(activeConvo, meId)}</p>
                  <p className="text-[11px] text-gray-500">
                    {typingInActive.length > 0
                      ? 'typing...'
                      : activeConvo.peer
                        ? online[activeConvo.peer.id] ? 'Online' : activeConvo.peer.lastSeenAt ? `Last seen ${fmtDay(activeConvo.peer.lastSeenAt)} ${fmtTime(activeConvo.peer.lastSeenAt)}` : 'Offline'
                        : `${activeConvo.memberCount} members`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => startCall('audio')} title="Audio call" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-brand-700"><Phone className="h-5 w-5" /></button>
                <button onClick={() => startCall('video')} title="Video call" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-brand-700"><Video className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-gray-50/60 px-4 py-4">
              {messages.isLoading && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}
              {(messages.data?.messages ?? []).map((m, idx) => {
                const mine = m.userId === meId;
                const showDay = idx === 0 || fmtDay((messages.data!.messages[idx - 1]).createdAt) !== fmtDay(m.createdAt);
                const seenByOthers = !mine && m.reads?.some((r) => r.userId !== meId);
                return (
                  <div key={m.id}>
                    {showDay && <p className="my-3 text-center text-[10px] font-medium uppercase tracking-wide text-gray-400">{fmtDay(m.createdAt)}</p>}
                    <div className={`group mb-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? 'bg-brand-600 text-white' : 'bg-white text-gray-800 ring-1 ring-gray-100'}`}>
                        {!mine && activeConvo.type !== 'direct' && (
                          <p className="mb-0.5 text-[10px] font-semibold text-brand-700">{displayName(m.user)}</p>
                        )}
                        {m.replyTo && (
                          <div className={`mb-1 rounded-lg px-2 py-1 text-[11px] ${mine ? 'bg-brand-500/40' : 'bg-gray-100'}`}>
                            <span className="font-semibold">{displayName(m.replyTo.user)}: </span>
                            {m.replyTo.deletedAt ? 'message deleted' : m.replyTo.content}
                          </div>
                        )}
                        {m.deletedAt ? (
                          <p className="italic text-gray-400">This message was deleted</p>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        )}
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {m.attachments.map((a, i) => (
                              a.mimeType?.startsWith('image/') ? (
                                <a key={i} href={`${API_URL}${a.url}`} target="_blank" rel="noreferrer">
                                  <img src={`${API_URL}${a.url}`} alt={a.name} className="max-h-48 rounded-lg object-cover" />
                                </a>
                              ) : (
                                <a key={i} href={`${API_URL}${a.url}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-1.5 text-[11px] font-medium underline-offset-2 hover:underline">
                                  <Paperclip className="h-3 w-3" /> {a.name}
                                </a>
                              )
                            ))}
                          </div>
                        )}
                        <div className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${mine ? 'text-brand-100' : 'text-gray-400'}`}>
                          {m.pinnedAt && <Pin className="h-2.5 w-2.5" />}
                          {m.editedAt && <span>edited</span>}
                          <span>{fmtTime(m.createdAt)}</span>
                          {mine && (seenByOthers ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                        </div>
                      </div>
                      <div className="ml-1 hidden flex-col gap-0.5 opacity-0 transition-opacity group-hover:flex">
                        <button title="Reply" onClick={() => setReplyTo(m)} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"><MessageCircle className="h-3 w-3" /></button>
                        {mine && !m.deletedAt && (
                          <>
                            <button title="Edit" onClick={() => { setEditing(m); setDraft(m.content); }} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 text-[10px] font-bold">✎</button>
                            <button title="Delete" onClick={() => api.delete(`/chat/messages/${m.id}`).then(() => queryClient.invalidateQueries({ queryKey: ['chat-messages', activeId] }))} className="rounded p-1 text-gray-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3 w-3" /></button>
                          </>
                        )}
                        {!m.deletedAt && (
                          <button title={m.pinnedAt ? 'Unpin' : 'Pin'} onClick={() => api.post(`/chat/messages/${m.id}/pin`).then(() => queryClient.invalidateQueries({ queryKey: ['chat-messages', activeId] }))} className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"><Pin className="h-3 w-3" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {replyTo && (
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600">
                <span>Replying to <b>{displayName(replyTo.user)}</b>: {replyTo.content.slice(0, 60)}</span>
                <button onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {editing && (
              <div className="flex items-center justify-between border-t border-gray-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <span>Editing message</span>
                <button onClick={() => { setEditing(null); setDraft(''); }}><X className="h-3.5 w-3.5" /></button>
              </div>
            )}

            <form
              className="flex items-end gap-2 border-t border-gray-100 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft.trim();
                if (!text) return;
                if (editing) doEdit();
                else sendMessage.mutate({ content: text, replyToId: replyTo?.id });
              }}
            >
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach file" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <textarea
                value={draft}
                onChange={(e) => onType(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).form?.requestSubmit(); } }}
                rows={1}
                placeholder={editing ? 'Edit message...' : 'Type a message...'}
                className="max-h-32 min-h-[38px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              />
              <button type="submit" disabled={!draft.trim() || sendMessage.isPending} className="rounded-xl bg-brand-600 p-2.5 text-white hover:bg-brand-700 disabled:opacity-50">
                {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
            {typingInActive.length > 0 && (
              <p className="px-4 pb-1.5 text-[10px] text-gray-400">{typingInActive.map((uid) => displayName(activeConvo.members.find((m) => m.userId === uid)?.user)).join(', ')} typing...</p>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-400">
            <MessageCircle className="h-10 w-10" />
            <p className="text-sm">Select a conversation or start a new chat</p>
          </div>
        )}
      </section>

      {/* New chat modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">New chat</h3>
              <button onClick={() => setShowNew(false)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="mb-3 flex gap-2">
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name (optional)" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-gray-100">
              {(chatUsers.data ?? []).map((u) => {
                const checked = groupMembers.has(u.id);
                return (
                  <label key={u.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setGroupMembers((s) => { const n = new Set(s); checked ? n.delete(u.id) : n.add(u.id); return n; })}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600"
                    />
                    <Avatar user={u} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{displayName(u)}</p>
                      <p className="truncate text-[11px] text-gray-400">{u.email}{u.department ? ` · ${u.department.name}` : ''}</p>
                    </div>
                  </label>
                );
              })}
              {chatUsers.isLoading && <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>}
            </div>
            <div className="flex justify-end gap-2">
              {groupMembers.size > 0 ? (
                <button
                  onClick={() => createGroup.mutate({ name: groupName.trim() || 'Group chat', memberIds: [...groupMembers] })}
                  disabled={createGroup.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {createGroup.isPending ? 'Creating...' : `Create group (${groupMembers.size + 1})`}
                </button>
              ) : (
                <p className="text-xs text-gray-400">Select members for a group, or click a user below for 1:1</p>
              )}
            </div>
            <div className="mt-3 border-t border-gray-100 pt-2">
              {(chatUsers.data ?? []).slice(0, 6).map((u) => (
                <button key={u.id} onClick={() => createDirect.mutate(u.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-brand-700 hover:bg-brand-50">
                  Message {displayName(u)} directly
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Incoming call modal */}
      {incoming && !activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
              <Avatar user={incoming.from} size="lg" />
            </div>
            <p className="text-lg font-semibold text-gray-900">{displayName(incoming.from)}</p>
            <p className="text-sm text-gray-500">Incoming {incoming.type} call...</p>
            <div className="mt-6 flex justify-center gap-4">
              <button onClick={rejectCall} className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600">
                <PhoneOff className="h-5 w-5" />
              </button>
              <button onClick={acceptCall} className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600">
                {incoming.type === 'video' ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active call overlay */}
      {activeCall && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1220]">
          <div className="flex items-center justify-between px-6 py-4 text-white">
            <div>
              <p className="font-semibold">{callStatus === 'connecting' ? 'Connecting...' : callSecondsStr}</p>
              <p className="text-xs text-gray-400">{activeCall.type === 'video' ? 'Video call' : 'Audio call'}</p>
            </div>
            <button onClick={endCallLocal} className="rounded-full bg-rose-500 p-3 text-white hover:bg-rose-600"><PhoneOff className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-4 overflow-auto p-6">
            {/* local */}
            <div className="relative">
              <video
                ref={(el) => { if (el && sessionRef.current?.localStream) el.srcObject = sessionRef.current.localStream; }}
                autoPlay playsInline muted
                className={`rounded-xl bg-gray-800 object-cover ${activeCall.type === 'video' ? 'h-56 w-80' : 'hidden'}`}
              />
              {activeCall.type === 'audio' && (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white">{initials(user)}</div>
              )}
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">You{muted ? ' (muted)' : ''}</span>
            </div>
            {/* remote peers */}
            {Object.entries(peerStreams).map(([uid, stream]) => (
              <div key={uid} className="relative">
                <video
                  ref={(el) => { if (el && stream) el.srcObject = stream; }}
                  autoPlay playsInline
                  className={`rounded-xl bg-gray-800 object-cover ${activeCall.type === 'video' ? 'h-56 w-80' : 'hidden'}`}
                />
                {activeCall.type === 'audio' && (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-2xl font-bold text-white">{initials({ firstName: peerNames[uid]?.split(' ')[0], lastName: peerNames[uid]?.split(' ')[1] })}</div>
                )}
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">{peerNames[uid] ?? 'Participant'}</span>
              </div>
            ))}
            {callStatus === 'connecting' && Object.keys(peerStreams).length === 0 && (
              <p className="text-sm text-gray-400">Ringing participants...</p>
            )}
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
