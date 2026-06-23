import { useEffect, useRef } from 'react';
import { ControlEventType, MouseEventPayload, KeyboardEventPayload } from '@discord-browser/shared';
import { UseWebSocketReturn } from './useWebSocket';

interface UseControlEventsOptions {
  sessionId: string | null;
  isController: boolean;
  ws: UseWebSocketReturn;
  overlayRef: React.RefObject<HTMLElement | null>;
}

/**
 * Attaches mouse and keyboard listeners to `overlayRef` when `isController`
 * is true. Sends normalised control events over the WebSocket.
 */
export function useControlEvents({
  sessionId,
  isController,
  ws,
  overlayRef,
}: UseControlEventsOptions): void {

  // Track last mousemove to throttle — browser already throttles to 60fps
  const lastMoveRef = useRef(0);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !isController || !sessionId) return;

    const sendEvent = (type: ControlEventType, payload: MouseEventPayload | KeyboardEventPayload) => {
      ws.send({
        type: 'control_event',
        sessionId,
        payload: { type, payload, timestamp: Date.now() },
      });
    };

    const norm = (ev: MouseEvent): { x: number; y: number } => {
      const rect = el.getBoundingClientRect();
      return {
        x: (ev.clientX - rect.left) / rect.width,
        y: (ev.clientY - rect.top) / rect.height,
      };
    };

    const onMouseMove = (ev: MouseEvent) => {
      const now = Date.now();
      if (now - lastMoveRef.current < 33) return; // ~30fps mousemove max
      lastMoveRef.current = now;
      sendEvent('mousemove', { ...norm(ev) });
    };

    const onMouseDown = (ev: MouseEvent) => {
      ev.preventDefault();
      sendEvent('mousedown', { ...norm(ev), button: ev.button });
    };

    const onMouseUp = (ev: MouseEvent) => {
      sendEvent('mouseup', { ...norm(ev), button: ev.button });
    };

    const onClick = (ev: MouseEvent) => {
      sendEvent('click', { ...norm(ev), button: ev.button });
    };

    const onDblClick = (ev: MouseEvent) => {
      sendEvent('dblclick', { ...norm(ev) });
    };

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      sendEvent('wheel', { x: 0, y: 0, deltaX: ev.deltaX, deltaY: ev.deltaY });
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      // Don't block browser shortcuts we need
      if (ev.key === 'F12') return;
      ev.preventDefault();
      sendEvent('keydown', {
        key: ev.key,
        code: ev.code,
        modifiers: {
          shift: ev.shiftKey,
          ctrl: ev.ctrlKey,
          alt: ev.altKey,
          meta: ev.metaKey,
        },
      });
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      sendEvent('keyup', { key: ev.key, code: ev.code });
    };

    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('wheel', onWheel, { passive: false });

    // Keyboard events on window when overlay is focused
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('click', onClick);
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isController, sessionId, ws, overlayRef]);
}
