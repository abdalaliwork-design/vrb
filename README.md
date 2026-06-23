# BrowserSync — Discord Activity

A shared cloud browser embedded in Discord voice channels.
Multiple users join a channel, open the Activity, see the same Chromium instance,
and one user at a time controls it with their mouse and keyboard.

Think lightweight Hyperbeam, but as a native Discord Activity.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│                  Discord Client                      │
│  ┌──────────────────────────────────────────────┐   │
│  │        Activity iframe (React + Vite)        │   │
│  │  LobbyScreen → ControlBar + BrowserViewport  │   │
│  │      ↕ WebSocket          ↕ MJPEG stream     │   │
│  └──────────────────────────────────────────────┘   │
│            ↕ Discord /.proxy tunnel                  │
└─────────────────────────────────────────────────────┘
                       ↕ HTTPS/WSS
┌─────────────────────────────────────────────────────┐
│              Backend (Node.js + Express)             │
│                                                      │
│  ConnectionManager (WebSocket)                       │
│     ↕ routes messages                               │
│  SessionManager (in-memory)                          │
│     ↕ owns                                          │
│  BrowserManager (Playwright/Chromium)                │
│     → screenshots → MJPEG HTTP route                │
│     ← control events (mouse / keyboard)              │
└─────────────────────────────────────────────────────┘
```

### Streaming approach

**MVP: MJPEG over HTTP.**

The backend captures a JPEG screenshot from Playwright at `STREAM_FPS` (default 15)
and streams them as `multipart/x-mixed-replace` — the same format IP cameras use.
Every browser renders this natively in an `<img>` tag, zero JavaScript required.

Latency: ~100–400 ms depending on network and FPS. Perfectly adequate for
casual co-browsing in a Discord call.

**Why not WebRTC?** WebRTC is 5× more complex to set up (TURN servers, ICE, SDP
negotiation) and the latency win doesn't matter at Discord voice-call distances.
The streaming module is isolated so it can be swapped for a LiveKit or mediasoup
implementation later without touching anything else.

### Session model

One session = one Chromium instance = one voice channel.

```
Session {
  hostId          — user who created the session
  controllerId    — currently driving (null if nobody)
  controlQueue[]  — users waiting for control
  viewers[]       — everyone connected
}
```

State is in-memory for MVP. Designed to swap to Redis: replace `SessionManager`
internals, keep the same method signatures.

---

## Repo structure

```
discord-browser-activity/
├── shared/               # TypeScript types shared between frontend and backend
│   └── src/types.ts
├── backend/
│   └── src/
│       ├── config.ts           # All env vars in one place
│       ├── app.ts              # Express app factory
│       ├── index.ts            # Entry point
│       ├── session/
│       │   └── SessionManager.ts
│       ├── browser/
│       │   └── BrowserManager.ts  # Playwright wrapper + MJPEG capture
│       ├── streaming/
│       │   └── mjpegRoute.ts      # GET /stream/:sessionId
│       └── ws/
│           └── ConnectionManager.ts  # WebSocket message router
├── frontend/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── lib/discord.ts         # Discord SDK wrapper + dev fallback
│       ├── hooks/
│       │   ├── useWebSocket.ts    # Auto-reconnecting WS client
│       │   ├── useSession.ts      # Session state machine
│       │   └── useControlEvents.ts # Mouse/keyboard capture
│       └── components/
│           ├── LobbyScreen.tsx
│           ├── ControlBar.tsx
│           ├── BrowserViewport.tsx
│           └── StatusBar.tsx
├── docker-compose.yml
└── README.md
```

---

## Prerequisites

- Node.js 20+
- npm 9+
- A Discord application (for production; optional in local dev)

---

## Local development (fastest path)

You can run the app entirely locally without registering a Discord application.
The frontend falls back to a fake user context when `VITE_DISCORD_CLIENT_ID` is not set.

### 1. Install dependencies

```bash
npm install                    # root workspace
npm install --workspace=shared
npm install --workspace=backend
npm install --workspace=frontend
```

Or use the convenience script:

```bash
npm run install:all
```

### 2. Install Playwright's Chromium

```bash
cd backend && npx playwright install chromium
```

### 3. Configure the backend

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — the defaults work for local dev
# DISCORD_CLIENT_ID / SECRET only required for production Discord auth
```

### 4. Configure the frontend

```bash
cp frontend/.env.example frontend/.env
# In local dev, leave VITE_DISCORD_CLIENT_ID blank to use the dev fallback
```

### 5. Start everything

```bash
npm run dev
```

This runs both backend (port 3001) and frontend (port 5173) concurrently.

Open **http://localhost:5173** in your browser. Click "Open Shared Browser".
Open a second tab to the same URL to test multi-viewer / control handoff.

---

## Discord Activity setup (production)

### Register the application

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Under **Activities**, enable the Activities feature
4. Set the **URL Mapping** root path to your deployed frontend URL
5. Under **OAuth2**, add your backend's `/auth/callback` as a redirect URI

### Environment variables

**Backend** (`backend/.env`):

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default 3001) |
| `DISCORD_CLIENT_ID` | Yes (prod) | Your Discord app's client ID |
| `DISCORD_CLIENT_SECRET` | Yes (prod) | Your Discord app's client secret |
| `BROWSER_START_URL` | No | Default page when browser launches (default: google.com) |
| `BROWSER_WIDTH` | No | Chromium viewport width (default 1280) |
| `BROWSER_HEIGHT` | No | Chromium viewport height (default 720) |
| `STREAM_FPS` | No | MJPEG frames per second (default 15) |
| `SESSION_IDLE_MS` | No | Idle session cleanup timeout in ms (default 600000) |
| `CONTROL_THROTTLE_MS` | No | Min ms between control events (default 16) |
| `CORS_ORIGIN` | No | Allowed CORS origin (default http://localhost:5173) |

**Frontend** (`frontend/.env`):

| Variable | Required | Description |
|---|---|---|
| `VITE_DISCORD_CLIENT_ID` | Yes (prod) | Your Discord app's client ID |
| `VITE_BACKEND_PORT` | No | Backend port for dev (default 3001) |
| `VITE_WS_URL` | No | Override WebSocket URL |

### Adding OAuth token exchange endpoint

The Discord SDK requires a backend endpoint to exchange the OAuth2 `code` for an
`access_token`. Add this route to `backend/src/app.ts`:

```typescript
app.post('/auth/token', async (req, res) => {
  const { code } = req.body;
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.discordClientId,
      client_secret: config.discordClientSecret,
      grant_type: 'authorization_code',
      code,
    }),
  });
  const data = await response.json();
  res.json({ access_token: data.access_token });
});
```

This is intentionally omitted from the MVP to keep local dev simple.

---

## Docker deployment

```bash
# Set required env vars in a .env file at the repo root
cp backend/.env.example .env
# Edit .env with your values

docker compose up --build
```

The backend runs on port 3001, the frontend nginx on port 5173.

For a production VPS, put nginx or Caddy in front with TLS, then:
- Proxy `https://yourdomain.com` → frontend container on port 80
- Proxy `https://yourdomain.com/.proxy/` → backend container on port 3001
- WebSocket upgrade pass-through is required

---

## WebSocket message protocol

All messages are JSON. Client → Server:

| Type | Payload | Description |
|---|---|---|
| `create_session` | `{ guildId, channelId, user }` | Create or join channel session |
| `join_session` | `{ sessionId, user }` | Join by explicit session ID |
| `request_control` | — | Add yourself to control queue |
| `release_control` | — | Give up control; next in queue takes over |
| `control_event` | `{ type, payload }` | Mouse or keyboard event (controller only) |
| `navigate` | `{ url }` | Navigate browser to URL (controller only) |
| `ping` | — | Keepalive |

Server → Client:

| Type | Description |
|---|---|
| `session_created` / `session_joined` | Session + stream info |
| `browser_ready` | Chromium launched; stream URL is live |
| `viewer_joined` / `viewer_left` | Presence update |
| `queue_updated` / `control_revoked` | Control state changed |
| `error` | Error message |
| `pong` | Heartbeat reply |

---

## Known limitations

1. **MJPEG doesn't carry audio.** If the target site plays audio, viewers won't hear it. Phase 4 should replace MJPEG with WebRTC to get audio+video.

2. **One Chromium process per session.** Each session forks a real browser — on a 2-vCPU VPS you'll hit CPU limits at ~3–4 concurrent sessions. Add a session cap in `SessionManager` as a safeguard.

3. **No authentication.** Anyone who has the session ID can join. In production, validate Discord tokens before allowing joins.

4. **State is not persisted.** Server restart kills all sessions. Redis integration is the first step toward durability.

5. **MJPEG has per-viewer connections.** Each viewer opens their own HTTP connection to `/stream/:id`. A lightweight mux (broadcasting one capture to N SSE clients) would help; mediasoup would solve it entirely.

6. **OAuth token exchange endpoint is stubbed.** The `initDiscord()` flow calls `/.proxy/auth/token` which doesn't exist yet. For full Discord integration you must implement that route (see above).

---

## Next 5 improvements

1. **Replace MJPEG with WebRTC via LiveKit.**
   - Dramatically lower latency (< 100 ms), carries audio, scales to 50+ viewers on one server.
   - Replace `BrowserManager.startStream()` with a LiveKit publish track; update `BrowserViewport` to use the LiveKit SDK.
   - Everything else stays the same.

2. **Persist sessions in Redis.**
   - `SessionManager` is already designed for this. Swap the `Map<>` internals for `ioredis` calls.
   - Enables horizontal scaling and session recovery on server restart.

3. **Authentication and permissions.**
   - Validate the Discord access token on every WebSocket connection.
   - Restrict session creation to the voice channel's members using the Discord API.
   - Add host-only actions (kick from queue, revoke control).

4. **Controller time limits.**
   - Auto-release control after N minutes of inactivity.
   - Show a countdown timer in the UI.
   - Move to the next person in queue automatically.

5. **Collaborative address bar.**
   - All viewers see the current URL (not just the controller).
   - Add page title and favicon to the control bar.
   - Implement forward/back buttons using Playwright's navigation history.
