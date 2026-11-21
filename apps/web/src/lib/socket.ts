import { io, Socket } from 'socket.io-client';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

let socket: Socket | null = null;
let currentToken: string | null = null;
const readyMap = new WeakMap<Socket, boolean>();

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, {
    auth: { token: currentToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
  });
  socket.on('connected', () => readyMap.set(socket!, true));
  socket.on('disconnect', () => readyMap.set(socket!, false));
  return socket;
}

export function connectSocket(token: string): Socket {
  currentToken = token;
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) s.connect();
  return s;
}

/** True once the server has finished authenticating this socket
 *  (the gateway emits a custom "connected" event after auth). */
export function isSocketReady(s?: Socket | null): boolean {
  const target = s ?? socket;
  return target ? readyMap.get(target) === true : false;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}
