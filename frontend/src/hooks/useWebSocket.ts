/**
 * useWebSocket
 *
 * Persistent WebSocket connection to the backend.
 * Reconnects automatically on disconnect.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { ClientMessage, ServerMessage } from '@discord-browser/shared';

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `ws://${window.location.hostname}:3001/ws`;

// In Discord (proxied): ws through /.proxy/ws
const PROXY_WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/.proxy/ws`;

function resolveWsUrl(): string {
  // If running inside Discord iframe, use the proxy path
  if (window.location.hostname.endsWith('.discordsays.com')) return PROXY_WS_URL;
  return WS_URL;
}

type MessageHandler = (msg: ServerMessage) => void;

export interface UseWebSocketReturn {
  connected: boolean;
  send: (msg: ClientMessage) => void;
  onMessage: (handler: MessageHandler) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const ws = new WebSocket(resolveWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[WS] Connected');
    };

    ws.onmessage = (ev) => {
      try {
        const msg: ServerMessage = JSON.parse(ev.data);
        handlersRef.current.forEach((h) => h(msg));
      } catch {
        console.warn('[WS] Bad message', ev.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[WS] Disconnected — reconnecting in 2s');
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = (err) => console.error('[WS] Error', err);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    // Heartbeat ping every 20s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20_000);

    return () => {
      mountedRef.current = false;
      clearInterval(pingInterval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Send called while disconnected', msg.type);
    }
  }, []);

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  return { connected, send, onMessage };
}
