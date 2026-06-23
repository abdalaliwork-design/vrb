/**
 * ConnectionManager
 *
 * Manages WebSocket connections and maps them to session/user pairs.
 * Handles all inbound messages and broadcasts state updates.
 */

import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import {
  ClientMessage,
  ServerMessage,
  ControlEvent,
  Session,
  StreamInfo,
} from '@discord-browser/shared';
import { sessionManager } from '../session/SessionManager';
import { browserManager } from '../browser/BrowserManager';
import { config } from '../config';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  username: string;
  sessionId: string | null;
}

export class ConnectionManager {
  private wss: WebSocketServer;
  // ws → ConnectedClient metadata
  private clients = new Map<WebSocket, ConnectedClient>();

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));

    // Listen for browser-ready events and notify session members
    browserManager.on('browser_ready', (sessionId: string) => {
      const session = sessionManager.setBrowserReady(sessionId, true);
      if (session) {
        this.broadcastToSession(sessionId, {
          type: 'browser_ready',
          sessionId,
          payload: this.buildStreamInfo(sessionId),
        });
      }
    });
  }

  // ─── Connection lifecycle ──────────────────────────────────────────────────

  private onConnection(ws: WebSocket, _req: IncomingMessage): void {
    // Temporary placeholder until the client identifies itself
    const client: ConnectedClient = {
      ws,
      userId: '',
      username: '',
      sessionId: null,
    };
    this.clients.set(ws, client);

    ws.on('message', (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        this.handleMessage(ws, client, msg);
      } catch {
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => this.onDisconnect(ws, client));
    ws.on('error', (err) => console.error('[WS] Client error:', err));

    // Heartbeat
    (ws as any).isAlive = true;
    ws.on('pong', () => { (ws as any).isAlive = true; });
  }

  private onDisconnect(ws: WebSocket, client: ConnectedClient): void {
    if (client.userId && client.sessionId) {
      const { session, wasController } = sessionManager.leaveSession(client.userId);

      if (session) {
        this.broadcastToSession(session.id, {
          type: 'viewer_left',
          sessionId: session.id,
          payload: { userId: client.userId, wasController, session },
        });
      } else {
        // Session was destroyed — close browser
        if (client.sessionId) {
          browserManager.closeSession(client.sessionId).catch(console.error);
        }
      }
    }
    this.clients.delete(ws);
  }

  // ─── Message routing ───────────────────────────────────────────────────────

  private async handleMessage(
    ws: WebSocket,
    client: ConnectedClient,
    msg: ClientMessage
  ): Promise<void> {
    switch (msg.type) {
      case 'ping':
        this.send(ws, { type: 'pong' });
        break;

      case 'create_session': {
        const { guildId, channelId, user } = msg.payload as any;
        if (!guildId || !channelId || !user?.userId) {
          return this.sendError(ws, 'Missing required fields');
        }

        // Check if session already exists for this channel
        let session = sessionManager.getSessionByChannel(guildId, channelId);
        if (!session) {
          session = sessionManager.createSession(guildId, channelId, user);
        } else {
          // Join existing session instead
          sessionManager.joinSession(session.id, user);
        }

        client.userId = user.userId;
        client.username = user.username;
        client.sessionId = session.id;

        this.send(ws, {
          type: 'session_created',
          sessionId: session.id,
          payload: { session, streamInfo: this.buildStreamInfo(session.id) },
        });

        // Launch browser (async — emits browser_ready when done)
        if (!session.browserReady) {
          browserManager.launchForSession(session.id).then(() => {
            browserManager.startStream(session.id);
          }).catch(console.error);
        }
        break;
      }

      case 'join_session': {
        const { sessionId, user } = msg.payload as any;
        const session = sessionManager.joinSession(sessionId, user);
        if (!session) {
          return this.sendError(ws, 'Session not found');
        }

        client.userId = user.userId;
        client.username = user.username;
        client.sessionId = session.id;

        this.send(ws, {
          type: 'session_joined',
          sessionId: session.id,
          payload: { session, streamInfo: this.buildStreamInfo(session.id) },
        });

        // Notify others
        this.broadcastToSession(session.id, {
          type: 'viewer_joined',
          sessionId: session.id,
          payload: { userId: user.userId, username: user.username, session },
        }, ws);

        // If browser already streaming, browser_ready fires immediately
        if (session.browserReady) {
          this.send(ws, {
            type: 'browser_ready',
            sessionId: session.id,
            payload: this.buildStreamInfo(session.id),
          });
        }
        break;
      }

      case 'leave_session': {
        if (!client.userId) break;
        const { session } = sessionManager.leaveSession(client.userId);
        client.sessionId = null;

        if (!session) {
          browserManager.closeSession(client.sessionId ?? '').catch(console.error);
        } else {
          this.broadcastToSession(session.id, {
            type: 'viewer_left',
            sessionId: session.id,
            payload: { userId: client.userId, session },
          });
        }
        break;
      }

      case 'request_control': {
        if (!client.sessionId || !client.userId) break;
        const session = sessionManager.requestControl(client.sessionId, client.userId);
        if (session) {
          this.broadcastToSession(session.id, {
            type: 'queue_updated',
            sessionId: session.id,
            payload: { session },
          });
        }
        break;
      }

      case 'release_control': {
        if (!client.sessionId || !client.userId) break;
        const session = sessionManager.releaseControl(client.sessionId, client.userId);
        if (session) {
          this.broadcastToSession(session.id, {
            type: 'control_revoked',
            sessionId: session.id,
            payload: { session },
          });
        }
        break;
      }

      case 'control_event': {
        if (!client.sessionId || !client.userId) break;

        // Validate: only the current controller can send events
        if (!sessionManager.isController(client.sessionId, client.userId)) {
          return this.sendError(ws, 'Not the active controller');
        }

        const event: ControlEvent = {
          ...(msg.payload as any),
          sessionId: client.sessionId,
          userId: client.userId,
          timestamp: Date.now(),
        };

        await browserManager.handleControlEvent(event);
        break;
      }

      case 'navigate': {
        if (!client.sessionId || !client.userId) break;
        if (!sessionManager.isController(client.sessionId, client.userId)) {
          return this.sendError(ws, 'Not the active controller');
        }
        const { url } = msg.payload as any;
        await browserManager.navigate(client.sessionId, url);
        break;
      }

      default:
        this.sendError(ws, `Unknown message type: ${msg.type}`);
    }
  }

  // ─── Broadcast helpers ─────────────────────────────────────────────────────

  broadcastToSession(sessionId: string, msg: ServerMessage, exclude?: WebSocket): void {
    const data = JSON.stringify(msg);
    for (const [ws, client] of this.clients.entries()) {
      if (client.sessionId === sessionId && ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: 'error', payload: { message } });
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────────

  startHeartbeat(): void {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          ws.terminate();
          return;
        }
        (ws as any).isAlive = false;
        ws.ping();
      });
    }, 30_000);
  }

  // ─── Stream info builder ───────────────────────────────────────────────────

  private buildStreamInfo(sessionId: string): StreamInfo {
    // MVP: MJPEG stream endpoint
    return {
      mode: 'mjpeg',
      mjpegUrl: `/stream/${sessionId}`,
    };
  }
}
