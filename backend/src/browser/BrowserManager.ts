/**
 * BrowserManager
 *
 * One Chromium instance per session. Playwright launches a headless browser,
 * we screenshot it at `streamFps` for the MJPEG stream, and we forward
 * control events as page interactions.
 *
 * Streaming strategy (MVP): server-sent MJPEG.
 *   - Simple, no WebRTC, works in any browser.
 *   - Latency ~100–300 ms at 15 fps over LAN / VPS — acceptable for an MVP.
 *   - Swap out for WebRTC/LiveKit in a later phase by replacing startStream().
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { EventEmitter } from 'events';
import {
  ControlEvent,
  MouseEventPayload,
  KeyboardEventPayload,
  TypePayload,
} from '@discord-browser/shared';
import { config } from '../config';

export interface BrowserInstance {
  sessionId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  streaming: boolean;
  screenshotInterval: NodeJS.Timeout | null;
  // last screenshot as JPEG buffer for new viewer handoff
  lastFrame: Buffer | null;
  // throttle: track last event time
  lastControlAt: number;
}

export class BrowserManager extends EventEmitter {
  private instances = new Map<string, BrowserInstance>();

  // ─── Launch ────────────────────────────────────────────────────────────────

  async launchForSession(sessionId: string): Promise<void> {
    if (this.instances.has(sessionId)) {
      console.warn(`[BrowserManager] Session ${sessionId} already has a browser`);
      return;
    }

    console.log(`[BrowserManager] Launching Chromium for session ${sessionId}`);

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--window-size=${config.browserWidth},${config.browserHeight}`,
      ],
    });

    const context = await browser.newContext({
      viewport: { width: config.browserWidth, height: config.browserHeight },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    const instance: BrowserInstance = {
      sessionId,
      browser,
      context,
      page,
      streaming: false,
      screenshotInterval: null,
      lastFrame: null,
      lastControlAt: 0,
    };

    this.instances.set(sessionId, instance);

    // Navigate to start page
    try {
      await page.goto(config.browserStartUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (err) {
      console.warn(`[BrowserManager] Start page load failed: ${err}`);
    }

    // Emit so SessionManager can flip browserReady
    this.emit('browser_ready', sessionId);
    console.log(`[BrowserManager] Browser ready for session ${sessionId}`);
  }

  // ─── Stream ────────────────────────────────────────────────────────────────

  /**
   * Start capturing frames and emitting them as 'frame' events.
   * Consumers (MJPEG HTTP route) listen on these events.
   */
  startStream(sessionId: string): void {
    const inst = this.instances.get(sessionId);
    if (!inst || inst.streaming) return;

    inst.streaming = true;
    const intervalMs = Math.round(1000 / config.streamFps);

    inst.screenshotInterval = setInterval(async () => {
      try {
        const buf = await inst.page.screenshot({ type: 'jpeg', quality: 70 });
        inst.lastFrame = buf;
        this.emit('frame', sessionId, buf);
      } catch {
        // page may be navigating — skip frame
      }
    }, intervalMs);

    console.log(`[BrowserManager] Stream started for session ${sessionId} @ ${config.streamFps}fps`);
  }

  stopStream(sessionId: string): void {
    const inst = this.instances.get(sessionId);
    if (!inst) return;
    if (inst.screenshotInterval) clearInterval(inst.screenshotInterval);
    inst.streaming = false;
  }

  getLastFrame(sessionId: string): Buffer | null {
    return this.instances.get(sessionId)?.lastFrame ?? null;
  }

  // ─── Control ───────────────────────────────────────────────────────────────

  async handleControlEvent(event: ControlEvent): Promise<void> {
    const inst = this.instances.get(event.sessionId);
    if (!inst) return;

    // Throttle: drop events arriving faster than config.controlThrottleMs
    const now = Date.now();
    if (now - inst.lastControlAt < config.controlThrottleMs) return;
    inst.lastControlAt = now;

    const { page } = inst;
    const vw = config.browserWidth;
    const vh = config.browserHeight;

    try {
      switch (event.type) {
        case 'mousemove': {
          const p = event.payload as MouseEventPayload;
          await page.mouse.move(p.x * vw, p.y * vh);
          break;
        }
        case 'mousedown': {
          const p = event.payload as MouseEventPayload;
          await page.mouse.move(p.x * vw, p.y * vh);
          await page.mouse.down({ button: buttonName(p.button) });
          break;
        }
        case 'mouseup': {
          const p = event.payload as MouseEventPayload;
          await page.mouse.up({ button: buttonName(p.button) });
          break;
        }
        case 'click': {
          const p = event.payload as MouseEventPayload;
          await page.mouse.click(p.x * vw, p.y * vh, { button: buttonName(p.button) });
          break;
        }
        case 'dblclick': {
          const p = event.payload as MouseEventPayload;
          await page.mouse.dblclick(p.x * vw, p.y * vh);
          break;
        }
        case 'wheel': {
          const p = event.payload as MouseEventPayload;
          await page.mouse.wheel(p.deltaX ?? 0, p.deltaY ?? 0);
          break;
        }
        case 'keydown': {
          const p = event.payload as KeyboardEventPayload;
          await page.keyboard.down(p.key);
          break;
        }
        case 'keyup': {
          const p = event.payload as KeyboardEventPayload;
          await page.keyboard.up(p.key);
          break;
        }
        case 'type': {
          const p = event.payload as TypePayload;
          // Limit to 200 chars to prevent spam
          await page.keyboard.type(p.text.slice(0, 200));
          break;
        }
      }
    } catch (err) {
      console.warn(`[BrowserManager] Control event ${event.type} failed: ${err}`);
    }
  }

  async navigate(sessionId: string, url: string): Promise<void> {
    const inst = this.instances.get(sessionId);
    if (!inst) return;

    // Ensure URL has a protocol
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    try {
      await inst.page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err) {
      console.warn(`[BrowserManager] Navigate to ${normalized} failed: ${err}`);
    }
  }

  // ─── Teardown ─────────────────────────────────────────────────────────────

  async closeSession(sessionId: string): Promise<void> {
    const inst = this.instances.get(sessionId);
    if (!inst) return;

    this.stopStream(sessionId);
    await inst.browser.close().catch(() => {});
    this.instances.delete(sessionId);
    console.log(`[BrowserManager] Closed browser for session ${sessionId}`);
  }

  async closeAll(): Promise<void> {
    const ids = Array.from(this.instances.keys());
    await Promise.all(ids.map((id) => this.closeSession(id)));
  }
}

// Helper: map button index to Playwright name
function buttonName(btn?: number): 'left' | 'middle' | 'right' {
  if (btn === 1) return 'middle';
  if (btn === 2) return 'right';
  return 'left';
}

// Singleton
export const browserManager = new BrowserManager();
