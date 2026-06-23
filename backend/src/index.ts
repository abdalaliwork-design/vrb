import http from 'http';
import { WebSocketServer } from 'ws';
import { createApp } from './app';
import { ConnectionManager } from './ws/ConnectionManager';
import { browserManager } from './browser/BrowserManager';
import { config } from './config';

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  // WebSocket server shares the same HTTP server (same port as REST)
  const wss = new WebSocketServer({ server, path: '/ws' });
  const connManager = new ConnectionManager(wss);
  connManager.startHeartbeat();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down…');
    await browserManager.closeAll();
    server.close(() => {
      console.log('[Server] Closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(config.port, () => {
    console.log(`[Server] Listening on http://localhost:${config.port}`);
    console.log(`[Server] WebSocket at ws://localhost:${config.port}/ws`);
    console.log(`[Server] MJPEG stream at http://localhost:${config.port}/stream/<sessionId>`);
  });
}

main().catch((err) => {
  console.error('[Server] Fatal:', err);
  process.exit(1);
});
