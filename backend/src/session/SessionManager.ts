/**
 * SessionManager
 *
 * In-memory for MVP. Every method that mutates state is synchronous and
 * returns the updated Session so callers can broadcast it. When adding Redis,
 * swap this class's internals — the interface stays the same.
 */

import { v4 as uuidv4 } from 'uuid';
import { Session, SessionUser } from '@discord-browser/shared';
import { config } from '../config';

export class SessionManager {
  // sessionId → Session
  private sessions = new Map<string, Session>();

  // userId → sessionId (so we can look up a user's session on disconnect)
  private userSessionMap = new Map<string, string>();

  // Idle cleanup timer handles
  private idleTimers = new Map<string, NodeJS.Timeout>();

  // ─── Create ────────────────────────────────────────────────────────────────

  createSession(guildId: string, channelId: string, host: SessionUser): Session {
    const id = uuidv4();
    const session: Session = {
      id,
      guildId,
      channelId,
      hostId: host.userId,
      controllerId: host.userId, // host starts as controller
      controlQueue: [],
      viewers: [host.userId],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      browserReady: false,
    };

    this.sessions.set(id, session);
    this.userSessionMap.set(host.userId, id);
    this.resetIdleTimer(id);
    return session;
  }

  // ─── Join ──────────────────────────────────────────────────────────────────

  joinSession(sessionId: string, user: SessionUser): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (!session.viewers.includes(user.userId)) {
      session.viewers.push(user.userId);
    }

    this.userSessionMap.set(user.userId, sessionId);
    session.lastActiveAt = Date.now();
    this.resetIdleTimer(sessionId);
    return session;
  }

  // ─── Leave ─────────────────────────────────────────────────────────────────

  /**
   * Remove a user from a session. Returns the updated session (or null if
   * the session was destroyed because it became empty).
   */
  leaveSession(userId: string): { session: Session | null; wasController: boolean } {
    const sessionId = this.userSessionMap.get(userId);
    if (!sessionId) return { session: null, wasController: false };

    const session = this.sessions.get(sessionId);
    if (!session) return { session: null, wasController: false };

    const wasController = session.controllerId === userId;

    // Remove from viewers
    session.viewers = session.viewers.filter((id) => id !== userId);

    // Remove from queue
    session.controlQueue = session.controlQueue.filter((id) => id !== userId);

    this.userSessionMap.delete(userId);

    // If session is now empty, destroy it
    if (session.viewers.length === 0) {
      this.destroySession(sessionId);
      return { session: null, wasController };
    }

    // Hand controller to next in queue
    if (wasController) {
      session.controllerId = session.controlQueue.shift() ?? session.viewers[0] ?? null;
    }

    session.lastActiveAt = Date.now();
    this.resetIdleTimer(sessionId);
    return { session, wasController };
  }

  // ─── Control ───────────────────────────────────────────────────────────────

  requestControl(sessionId: string, userId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (!session.viewers.includes(userId)) return null;
    if (session.controllerId === userId) return session; // already in control

    if (!session.controlQueue.includes(userId)) {
      session.controlQueue.push(userId);
    }

    return session;
  }

  releaseControl(sessionId: string, userId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.controllerId !== userId) return session; // not in control, noop

    // Assign next in queue
    session.controllerId = session.controlQueue.shift() ?? null;
    return session;
  }

  // ─── Browser ready ─────────────────────────────────────────────────────────

  setBrowserReady(sessionId: string, ready: boolean): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.browserReady = ready;
    return session;
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  getSession(sessionId: string): Session | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getSessionByChannel(guildId: string, channelId: string): Session | null {
    for (const s of this.sessions.values()) {
      if (s.guildId === guildId && s.channelId === channelId) return s;
    }
    return null;
  }

  getUserSession(userId: string): Session | null {
    const sid = this.userSessionMap.get(userId);
    return sid ? (this.sessions.get(sid) ?? null) : null;
  }

  isController(sessionId: string, userId: string): boolean {
    return this.sessions.get(sessionId)?.controllerId === userId;
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Remove all users from the map
    session.viewers.forEach((uid) => this.userSessionMap.delete(uid));

    clearTimeout(this.idleTimers.get(sessionId));
    this.idleTimers.delete(sessionId);
    this.sessions.delete(sessionId);

    console.log(`[SessionManager] Destroyed session ${sessionId}`);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  private resetIdleTimer(sessionId: string): void {
    const existing = this.idleTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      console.log(`[SessionManager] Session ${sessionId} idle — destroying`);
      // BrowserManager is notified via the onSessionDestroy callback
      this.destroySession(sessionId);
    }, config.sessionIdleMs);

    this.idleTimers.set(sessionId, timer);
  }
}

// Singleton for MVP
export const sessionManager = new SessionManager();
