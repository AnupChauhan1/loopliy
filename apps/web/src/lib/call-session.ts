import type { Socket } from 'socket.io-client';

export interface CallPeer {
  userId: string;
  name: string;
  stream?: MediaStream;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  polite: boolean; // polite peer rolls back on offer collision
}

const iceServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
// Optional TURN relay for restrictive networks — set NEXT_PUBLIC_TURN_URL,
// NEXT_PUBLIC_TURN_USERNAME and NEXT_PUBLIC_TURN_CREDENTIAL on the web service.
const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
if (turnUrl) {
  iceServers.push({
    urls: turnUrl,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined,
  });
}
const RTC_CONFIG: RTCConfiguration = { iceServers };

/**
 * Mesh WebRTC call session for 1:1 and small group calls.
 * Signaling is relayed through the chat gateway (call:signal events)
 * using the perfect-negotiation pattern.
 */
export class CallSession {
  readonly callId: string;
  readonly type: 'audio' | 'video';
  readonly conversationId: string;
  readonly localUserId: string;

  localStream: MediaStream | null = null;
  peers = new Map<string, PeerEntry>();
  peerStreams = new Map<string, MediaStream>();
  onPeerStream: (userId: string, stream: MediaStream | null) => void = () => {};
  onPeerLeft: (userId: string) => void = () => {};

  private makingOffer = new Map<string, boolean>();
  private ignoreOffer = new Map<string, boolean>();
  private signalHandler: ((payload: any) => void) | null = null;

  constructor(opts: {
    callId: string;
    type: 'audio' | 'video';
    conversationId: string;
    localUserId: string;
    socket: Socket;
  }) {
    this.callId = opts.callId;
    this.type = opts.type;
    this.conversationId = opts.conversationId;
    this.localUserId = opts.localUserId;
    this.socket = opts.socket;
    this.bindSignals();
  }

  private socket: Socket;

  private bindSignals() {
    this.signalHandler = (payload: any) => {
      if (payload.callId !== this.callId || payload.fromUserId === this.localUserId) return;
      void this.handleSignal(payload.fromUserId, payload.signal);
    };
    this.socket.on('call:signal', this.signalHandler);
  }

  async startLocalMedia(): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.type === 'video',
    });
    return this.localStream;
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  setCameraOff(off: boolean) {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = !off));
  }

  private sendSignal(toUserId: string, signal: any) {
    this.socket.emit('call:signal', { callId: this.callId, toUserId, signal });
  }

  private async ensurePeer(userId: string): Promise<PeerEntry> {
    let entry = this.peers.get(userId);
    if (entry) return entry;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const polite = this.localUserId > userId; // deterministic glare resolution
    entry = { pc, polite };
    this.peers.set(userId, entry);
    this.makingOffer.set(userId, false);
    this.ignoreOffer.set(userId, false);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    }
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer.set(userId, true);
        await pc.setLocalDescription();
        this.sendSignal(userId, { type: 'offer', sdp: pc.localDescription });
      } catch (err) {
        console.error('negotiation needed error', err);
      } finally {
        this.makingOffer.set(userId, false);
      }
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.peerStreams.set(userId, stream);
        this.onPeerStream(userId, stream);
      }
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(userId, { type: 'ice', candidate: event.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        this.removePeer(userId);
      }
    };
    return entry;
  }

  /** Start (or re-use) a peer connection — triggers offer via onnegotiationneeded. */
  async addPeer(userId: string) {
    if (userId === this.localUserId) return;
    const entry = await this.ensurePeer(userId);
    // Force negotiation kick for the impolite side
    if (!entry.polite && entry.pc.signalingState === 'stable' && !this.makingOffer.get(userId)) {
      try {
        this.makingOffer.set(userId, true);
        await entry.pc.setLocalDescription(await entry.pc.createOffer());
        this.sendSignal(userId, { type: 'offer', sdp: entry.pc.localDescription });
      } catch (err) {
        console.error('addPeer offer error', err);
      } finally {
        this.makingOffer.set(userId, false);
      }
    }
  }

  private async handleSignal(fromUserId: string, signal: any) {
    const entry = await this.ensurePeer(fromUserId);
    const pc = entry.pc;
    const polite = entry.polite;
    try {
      if (signal.type === 'offer') {
        const offerCollision = this.makingOffer.get(fromUserId) || pc.signalingState !== 'stable';
        this.ignoreOffer.set(fromUserId, !polite && offerCollision);
        if (this.ignoreOffer.get(fromUserId)) return;
        await pc.setRemoteDescription(signal.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        this.sendSignal(fromUserId, { type: 'answer', sdp: pc.localDescription });
      } else if (signal.type === 'answer') {
        if (this.ignoreOffer.get(fromUserId) && !polite) return;
        await pc.setRemoteDescription(signal.sdp);
      } else if (signal.type === 'ice') {
        if (this.ignoreOffer.get(fromUserId) && !polite) return;
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch (e) {
          if (!this.ignoreOffer.get(fromUserId)) throw e;
        }
      }
    } catch (err) {
      console.error('call signal error', err);
    }
  }

  removePeer(userId: string) {
    const entry = this.peers.get(userId);
    if (entry) {
      entry.pc.close();
      this.peers.delete(userId);
      this.peerStreams.delete(userId);
      this.onPeerLeft(userId);
      this.onPeerStream(userId, null);
    }
  }

  peerIds() {
    return [...this.peers.keys()];
  }

  destroy() {
    if (this.signalHandler) this.socket.off('call:signal', this.signalHandler);
    for (const id of [...this.peers.keys()]) this.removePeer(id);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }
}
