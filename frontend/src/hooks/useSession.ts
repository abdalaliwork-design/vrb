import { useState, useEffect, useCallback } from 'react';
import { Session, StreamInfo, ServerMessage } from '@discord-browser/shared';
import { UseWebSocketReturn } from './useWebSocket';
import { DiscordContext } from '../lib/discord';

export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'active'
  | 'error';

export interface UseSessionReturn {
  session: Session | null;
  streamInfo: StreamInfo | null;
  status: SessionStatus;
  error: string | null;
  isController: boolean;
  isInQueue: boolean;
  queuePosition: number;
  createOrJoinSession: () => void;
  requestControl: () => void;
  releaseControl: () => void;
  navigate: (url: string) => void;
}

export function useSession(
  ws: UseWebSocketReturn,
  discordCtx: DiscordContext | null
): UseSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = ws.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'session_created':
        case 'session_joined': {
          const { session: s, streamInfo: si } = msg.payload as any;
          setSession(s);
          setStreamInfo(si);
          setStatus('active');
          break;
        }
        case 'session_state':
        case 'viewer_joined':
        case 'viewer_left':
        case 'queue_updated':
        case 'control_revoked':
        case 'control_granted': {
          const { session: s } = msg.payload as any;
          if (s) setSession(s);
          break;
        }
        case 'browser_ready': {
          const si = msg.payload as StreamInfo;
          setStreamInfo(si);
          setSession((prev) => prev ? { ...prev, browserReady: true } : prev);
          break;
        }
        case 'error':
        case 'session_error': {
          const { message } = msg.payload as any;
          setError(message);
          setStatus('error');
          break;
        }
      }
    });
    return off;
  }, [ws]);

  const createOrJoinSession = useCallback(() => {
    if (!discordCtx || !ws.connected) return;
    setStatus('connecting');
    setError(null);

    ws.send({
      type: 'create_session',
      payload: {
        guildId: discordCtx.guildId,
        channelId: discordCtx.channelId,
        user: {
          userId: discordCtx.userId,
          username: discordCtx.username,
          avatarUrl: discordCtx.avatarUrl,
        },
      },
    });
  }, [ws, discordCtx]);

  const requestControl = useCallback(() => {
    if (!session) return;
    ws.send({ type: 'request_control', sessionId: session.id });
  }, [ws, session]);

  const releaseControl = useCallback(() => {
    if (!session) return;
    ws.send({ type: 'release_control', sessionId: session.id });
  }, [ws, session]);

  const navigate = useCallback((url: string) => {
    if (!session) return;
    ws.send({ type: 'navigate', sessionId: session.id, payload: { url } });
  }, [ws, session]);

  const userId = discordCtx?.userId ?? '';
  const isController = session?.controllerId === userId;
  const queuePosition = session ? session.controlQueue.indexOf(userId) : -1;
  const isInQueue = queuePosition >= 0;

  return {
    session,
    streamInfo,
    status,
    error,
    isController,
    isInQueue,
    queuePosition,
    createOrJoinSession,
    requestControl,
    releaseControl,
    navigate,
  };
}
