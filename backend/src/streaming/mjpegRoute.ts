/**
 * MJPEG streaming route
 *
 * GET /stream/:sessionId
 *
 * Opens a long-lived HTTP connection and pushes JPEG frames as multipart
 * MJPEG. Every browser that can display <img src="/stream/..."> will work.
 *
 * This is the simplest possible streaming approach:
 *   - No WebRTC, no SFU, no extra services.
 *   - Latency: ~100–400 ms depending on frame rate and network.
 *   - Each viewer opens their own connection to the server.
 *
 * To swap for WebRTC later: replace this route with a signalling endpoint
 * and use browserManager to pipe a MediaStream instead of screenshots.
 */

import { Router, Request, Response } from 'express';
import { browserManager } from '../browser/BrowserManager';
import { sessionManager } from '../session/SessionManager';

export function createStreamRouter(): Router {
  const router = Router();

  router.get('/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Set MJPEG headers
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=--frameboundary',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send last known frame immediately so the viewer doesn't see a blank
    const lastFrame = browserManager.getLastFrame(sessionId);
    if (lastFrame) {
      pushFrame(res, lastFrame);
    }

    // Subscribe to new frames
    const onFrame = (sid: string, buf: Buffer) => {
      if (sid !== sessionId) return;
      pushFrame(res, buf);
    };

    browserManager.on('frame', onFrame);

    // Clean up when client disconnects
    req.on('close', () => {
      browserManager.off('frame', onFrame);
    });
  });

  return router;
}

function pushFrame(res: Response, jpeg: Buffer): void {
  try {
    res.write(
      `--frameboundary\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`
    );
    res.write(jpeg);
    res.write('\r\n');
  } catch {
    // Client disconnected mid-write — ignore
  }
}
