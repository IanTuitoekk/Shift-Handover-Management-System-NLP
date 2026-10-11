import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

// Socket.IO runs on the same origin as the REST API (e.g. http://localhost:3000).
const SOCKET_URL = new URL(API_URL).origin;

/**
 * Connects to the backend's real-time push with the user's JWT and calls `handlers[event](data)`
 * for each event. Returns whether the socket is connected; callers fall back to polling when not.
 * Reconnects automatically, and calls `handlers.reconnected()` after a dropped connection comes back
 * so missed changes can be refetched.
 */
export function useRealtime(token, handlers) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    let wasConnected = false;

    socket.on('connect', () => {
      setConnected(true);
      if (wasConnected) handlersRef.current.reconnected?.();
      wasConnected = true;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.onAny((event, data) => handlersRef.current[event]?.(data));

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [token]);

  return connected;
}

/** Lets pages that hold their own report lists know a new report exists. */
export const REPORTS_CHANGED = 'kq:reports-changed';
