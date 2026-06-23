import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  
  // Discord OAuth2 — needed for token exchange in production
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',

  // URL the browser inside Playwright opens by default
  browserStartUrl: process.env.BROWSER_START_URL || 'https://www.google.com',

  // How long (ms) an idle session lives before cleanup
  sessionIdleMs: parseInt(process.env.SESSION_IDLE_MS || '600000', 10), // 10 min

  // Screenshot capture rate for MJPEG stream (frames per second)
  streamFps: parseInt(process.env.STREAM_FPS || '15', 10),

  // Browser viewport
  browserWidth: parseInt(process.env.BROWSER_WIDTH || '1280', 10),
  browserHeight: parseInt(process.env.BROWSER_HEIGHT || '720', 10),

  // CORS origin — in dev use Vite dev server; in prod use Discord CDN proxy
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Throttle: minimum ms between control events per controller
  controlThrottleMs: parseInt(process.env.CONTROL_THROTTLE_MS || '16', 10), // ~60fps max
};
