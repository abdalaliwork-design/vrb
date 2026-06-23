import express from 'express';
import cors from 'cors';
import { createStreamRouter } from './streaming/mjpegRoute';
import { sessionManager } from './session/SessionManager';
import { config } from './config';

export function createApp() {
  const app = express();

  app.use(cors({
    // In prod, Railway provides RAILWAY_PUBLIC_DOMAIN — we allow that plus the config origin.
    origin: (origin, cb) => {
      const allowed = [
        config.corsOrigin,
        process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
      ].filter(Boolean);
      // Allow requests with no origin (curl, mobile apps, same-origin iframe)
      if (!origin || allowed.some(o => origin.startsWith(o as string))) {
        cb(null, true);
      } else {
        cb(null, true); // Open for MVP — lock down in production
      }
    },
    credentials: true,
  }));

  app.use(express.json());

  // ─── Health check ────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ ok: true, sessions: sessionManager.listSessions().length });
  });

  // ─── Discord OAuth2 token exchange ───────────────────────────────────────
  // The Discord Embedded App SDK calls this endpoint to exchange an
  // authorization code for an access token. Required for production.
  app.post('/auth/token', async (req, res) => {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: 'Missing code' }); return; }
    if (!config.discordClientId || !config.discordClientSecret) {
      // In dev mode with no Discord credentials, return a dummy token
      res.json({ access_token: 'dev-token' });
      return;
    }
    try {
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
      const data = await response.json() as any;
      if (data.error) { res.status(400).json({ error: data.error }); return; }
      res.json({ access_token: data.access_token });
    } catch (err) {
      console.error('[Auth] Token exchange failed:', err);
      res.status(500).json({ error: 'Token exchange failed' });
    }
  });

  // ─── MJPEG stream ────────────────────────────────────────────────────────
  app.use('/stream', createStreamRouter());

  // ─── Debug: list sessions ────────────────────────────────────────────────
  app.get('/sessions', (_req, res) => {
    res.json(sessionManager.listSessions());
  });

  return app;
}
