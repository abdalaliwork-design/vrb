import React, { useRef, useEffect } from 'react';
import { StreamInfo } from '@discord-browser/shared';
import { useControlEvents } from '../hooks/useControlEvents';
import { UseWebSocketReturn } from '../hooks/useWebSocket';

interface BrowserViewportProps {
  streamInfo: StreamInfo | null;
  browserReady: boolean;
  isController: boolean;
  sessionId: string;
  ws: UseWebSocketReturn;
}

/**
 * Renders the MJPEG stream in an <img> tag.
 *
 * For the controller, an invisible div overlay captures all mouse/keyboard
 * events and forwards them to the backend via WebSocket.
 *
 * For viewers, the overlay just shows a "view only" cursor.
 *
 * MJPEG note: The browser requests the stream URL from the backend via HTTP
 * and renders each JPEG frame as it arrives — no JavaScript needed for
 * the playback side. This is the simplest possible approach.
 */
export function BrowserViewport({
  streamInfo,
  browserReady,
  isController,
  sessionId,
  ws,
}: BrowserViewportProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useControlEvents({
    sessionId,
    isController,
    ws,
    overlayRef: overlayRef as React.RefObject<HTMLElement | null>,
  });

  // Build the actual stream URL
  // In production: the MJPEG route is behind the Discord proxy
  const streamUrl = streamInfo?.mjpegUrl
    ? buildStreamUrl(streamInfo.mjpegUrl)
    : null;

  return (
    <div style={styles.container}>
      {!browserReady && (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Starting browser…</p>
        </div>
      )}

      {browserReady && streamUrl && (
        <>
          {/* MJPEG img — browser handles multipart streaming natively */}
          <img
            src={streamUrl}
            alt="Shared browser"
            style={styles.stream}
            draggable={false}
          />

          {/* Transparent overlay — intercepts events for the controller */}
          <div
            ref={overlayRef}
            style={{
              ...styles.overlay,
              cursor: isController ? 'crosshair' : 'not-allowed',
              pointerEvents: 'all',
            }}
            tabIndex={isController ? 0 : -1}
            title={isController ? 'You are controlling the browser' : 'View only'}
          />

          {isController && (
            <div style={styles.controlBadge}>🎮 You're driving</div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Resolve the stream URL for the current environment.
 * - In Discord (proxied): prefix with /.proxy
 * - In local dev: use the direct backend URL
 */
function buildStreamUrl(path: string): string {
  if (window.location.hostname.endsWith('.discordsays.com')) {
    return `/.proxy${path}`;
  }
  const backendPort = import.meta.env.VITE_BACKEND_PORT ?? '3001';
  return `http://${window.location.hostname}:${backendPort}${path}`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    position: 'relative',
    background: '#000',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    color: '#b5bac1',
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #3b3d44',
    borderTopColor: '#5865f2',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 14,
    color: '#b5bac1',
  },
  stream: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
  },
  controlBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(87,242,135,0.15)',
    color: '#57f287',
    border: '1px solid rgba(87,242,135,0.3)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    zIndex: 20,
    pointerEvents: 'none',
  },
};
