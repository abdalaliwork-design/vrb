import React, { useState } from 'react';
import { Session } from '@discord-browser/shared';

interface ControlBarProps {
  session: Session;
  userId: string;
  isController: boolean;
  isInQueue: boolean;
  queuePosition: number;
  onRequestControl: () => void;
  onReleaseControl: () => void;
  onNavigate: (url: string) => void;
}

export function ControlBar({
  session,
  userId,
  isController,
  isInQueue,
  queuePosition,
  onRequestControl,
  onReleaseControl,
  onNavigate,
}: ControlBarProps) {
  const [urlInput, setUrlInput] = useState('');

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onNavigate(urlInput.trim());
      setUrlInput('');
    }
  };

  const viewerCount = session.viewers.length;

  return (
    <div style={styles.bar}>
      {/* Left: viewer count */}
      <div style={styles.left}>
        <span style={styles.viewers}>
          👥 {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
        </span>
        {session.controllerId && (
          <span style={styles.controllerTag}>
            🎮 {isController ? 'You are driving' : `User controlling`}
          </span>
        )}
        {!session.controllerId && (
          <span style={{ ...styles.controllerTag, color: '#faa61a' }}>
            No active controller
          </span>
        )}
      </div>

      {/* Centre: URL bar (only shown to controller) */}
      {isController && (
        <form onSubmit={handleNavigate} style={styles.urlForm}>
          <input
            style={styles.urlInput}
            type="text"
            placeholder="Enter URL and press Enter…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </form>
      )}

      {/* Right: control buttons */}
      <div style={styles.right}>
        {isController ? (
          <button style={{ ...styles.btn, ...styles.releaseBtn }} onClick={onReleaseControl}>
            Release Control
          </button>
        ) : isInQueue ? (
          <button style={{ ...styles.btn, ...styles.queueBtn }} disabled>
            #{queuePosition + 1} in queue
          </button>
        ) : (
          <button style={{ ...styles.btn, ...styles.requestBtn }} onClick={onRequestControl}>
            Request Control
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 12px',
    background: '#111214',
    borderBottom: '1px solid #3b3d44',
    height: 44,
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 180,
  },
  viewers: {
    fontSize: 12,
    color: '#b5bac1',
    whiteSpace: 'nowrap',
  },
  controllerTag: {
    fontSize: 12,
    color: '#57f287',
    background: 'rgba(87,242,135,0.1)',
    padding: '2px 8px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
  urlForm: {
    flex: 1,
  },
  urlInput: {
    width: '100%',
    background: '#1e1f22',
    border: '1px solid #3b3d44',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    padding: '4px 10px',
    outline: 'none',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 150,
    justifyContent: 'flex-end',
  },
  btn: {
    border: 'none',
    borderRadius: 6,
    padding: '5px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  requestBtn: {
    background: '#5865f2',
    color: '#fff',
  },
  releaseBtn: {
    background: '#ed4245',
    color: '#fff',
  },
  queueBtn: {
    background: '#3b3d44',
    color: '#b5bac1',
    cursor: 'default',
  },
};
