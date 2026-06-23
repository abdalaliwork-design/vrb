// ─── Session ────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  guildId: string;
  channelId: string;
  hostId: string;
  controllerId: string | null;
  controlQueue: string[]; // user IDs waiting for control
  viewers: string[];      // all connected user IDs
  createdAt: number;
  lastActiveAt: number;
  browserReady: boolean;
}

export interface SessionUser {
  userId: string;
  username: string;
  avatarUrl?: string;
}

// ─── WebSocket message types ────────────────────────────────────────────────

export type ClientMessageType =
  | 'create_session'
  | 'join_session'
  | 'leave_session'
  | 'request_control'
  | 'release_control'
  | 'yield_control'        // host/controller kicks next in queue
  | 'control_event'
  | 'navigate'
  | 'ping';

export type ServerMessageType =
  | 'session_created'
  | 'session_joined'
  | 'session_state'        // full state sync
  | 'session_error'
  | 'control_granted'
  | 'control_revoked'
  | 'queue_updated'
  | 'viewer_joined'
  | 'viewer_left'
  | 'browser_ready'
  | 'stream_info'          // ICE / SDP / stream URL info
  | 'error'
  | 'pong';

// Client → Server
export interface ClientMessage {
  type: ClientMessageType;
  sessionId?: string;
  payload?: unknown;
}

// Server → Client
export interface ServerMessage {
  type: ServerMessageType;
  sessionId?: string;
  payload?: unknown;
}

// ─── Control Events ──────────────────────────────────────────────────────────

export type ControlEventType =
  | 'mousemove'
  | 'mousedown'
  | 'mouseup'
  | 'click'
  | 'dblclick'
  | 'keydown'
  | 'keyup'
  | 'keypress'
  | 'wheel'
  | 'type';

export interface MouseEventPayload {
  x: number;       // 0–1 normalized
  y: number;       // 0–1 normalized
  button?: number; // 0=left, 1=middle, 2=right
  deltaX?: number;
  deltaY?: number;
}

export interface KeyboardEventPayload {
  key: string;
  code: string;
  modifiers?: {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
}

export interface TypePayload {
  text: string;
}

export interface ControlEvent {
  type: ControlEventType;
  sessionId: string;
  userId: string;
  timestamp: number;
  payload: MouseEventPayload | KeyboardEventPayload | TypePayload;
}

// ─── Streaming ───────────────────────────────────────────────────────────────

export interface StreamInfo {
  // MVP: MJPEG stream URL served from backend
  // Future: WebRTC SDP offer / LiveKit token
  mode: 'mjpeg' | 'webrtc';
  mjpegUrl?: string;
  // webrtc fields added in Phase 4
}

// ─── API response shapes ─────────────────────────────────────────────────────

export interface CreateSessionRequest {
  guildId: string;
  channelId: string;
  user: SessionUser;
}

export interface CreateSessionResponse {
  session: Session;
  streamInfo: StreamInfo;
}

export interface JoinSessionRequest {
  sessionId: string;
  user: SessionUser;
}
