'use client';

import {
  collection, doc, setDoc, getDoc, updateDoc, addDoc, onSnapshot,
  serverTimestamp, query, orderBy, where, Unsubscribe,
} from 'firebase/firestore';
import { db } from './firestore';
import { auth } from './firebase';

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface MeetingRoom {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  hostId: string;
  hostName: string;
  status: 'active' | 'ended';
  createdAt?: any;
  endedAt?: any;
  durationSec?: number;
}

export interface Participant {
  id: string;
  name: string;
  role: string;
  isGuest: boolean;
  cameraOn: boolean;
  micOn: boolean;
  joinedAt?: any;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  isGuest: boolean;
  text: string;
  createdAt?: any;
}

export interface Signal {
  id: string;
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'ice';
  payload: any;
  createdAt?: any;
}

export function myId(): string {
  return auth.currentUser?.uid ?? `guest-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createMeetingRoom(opts: {
  title: string;
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  hostName: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'meetings'), {
    title: opts.title,
    projectId: opts.projectId ?? null,
    projectName: opts.projectName ?? null,
    clientId: opts.clientId ?? null,
    clientName: opts.clientName ?? null,
    hostId: myId(),
    hostName: opts.hostName,
    status: 'active',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchActiveMeetingCount(cb: (n: number) => void): Unsubscribe {
  return onSnapshot(collection(db, 'meetings'), (snap) => {
    cb(snap.docs.filter((d) => d.data().status === 'active').length);
  });
}

export function watchMeeting(roomId: string, cb: (m: MeetingRoom | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'meetings', roomId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as MeetingRoom) : null);
  });
}

export function watchParticipants(roomId: string, cb: (p: Participant[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'meetings', roomId, 'participants'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Participant)));
  });
}

export function watchMessages(roomId: string, cb: (m: ChatMessage[]) => void): Unsubscribe {
  const q = query(collection(db, 'meetings', roomId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)));
  });
}

export function watchSignals(roomId: string, cb: (s: Signal[]) => void): Unsubscribe {
  const q = query(collection(db, 'meetings', roomId, 'signals'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Signal)));
  });
}

export async function joinParticipant(roomId: string, p: Omit<Participant, 'joinedAt'>) {
  await setDoc(doc(db, 'meetings', roomId, 'participants', p.id), {
    ...p,
    joinedAt: serverTimestamp(),
  });
}

export async function leaveParticipant(roomId: string, pid: string) {
  await updateDoc(doc(db, 'meetings', roomId, 'participants', pid), { left: true }).catch(() => {});
  // Firestore doc delete needs admin in some rules; mark left instead.
}

export async function sendSignal(roomId: string, from: string, to: string, type: Signal['type'], payload: any) {
  await addDoc(collection(db, 'meetings', roomId, 'signals'), {
    from, to, type, payload, createdAt: serverTimestamp(),
  });
}

export async function sendChat(roomId: string, msg: Omit<ChatMessage, 'id' | 'createdAt'>) {
  await addDoc(collection(db, 'meetings', roomId, 'messages'), {
    ...msg,
    createdAt: serverTimestamp(),
  });
}

export async function endMeeting(roomId: string, startedAt?: number) {
  const durationSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined;
  await updateDoc(doc(db, 'meetings', roomId), {
    status: 'ended',
    endedAt: serverTimestamp(),
    durationSec: durationSec ?? null,
  }).catch(() => {});
}

export async function ensureMeetingDoc(roomId: string, fallback: Partial<MeetingRoom>) {
  const snap = await getDoc(doc(db, 'meetings', roomId));
  if (!snap.exists()) {
    await setDoc(doc(db, 'meetings', roomId), {
      title: fallback.title ?? 'Client Meeting',
      projectId: fallback.projectId ?? null,
      projectName: fallback.projectName ?? null,
      hostId: fallback.hostId ?? myId(),
      hostName: fallback.hostName ?? 'Host',
      status: 'active',
      createdAt: serverTimestamp(),
    }).catch(() => {});
  }
}
