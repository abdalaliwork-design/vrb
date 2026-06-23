import React from 'react';

interface StatusBarProps {
  connected: boolean;
  sessionId: string | null;
  error: string | null;
}

export function StatusBar({ connected, sessionId, error }: StatusBarProps) {
  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <span style={{ ...styles.dot, background: connected ? '#57f287' : '#ed4245' }} />
        <span style={styles.label}>{connected ? 'Connected' : 'Reconnecting…'}</span>
        {sessionId && (
          <span style={styles.sessionId}>
            Session: {sessionId.slice(0, 8)}…
          </span>
        )}
      </div>

      {error && (
        <span style={styles.error}>⚠️ {error}</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '3px 12px',
    background: '#111214',
    borderTop: '1px solid #3b3d44',
    height: 28,
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    fontSize: 11,
    color: '#b5bac1',
  },
  sessionId: {
    fontSize: 11,
    color: '#6d6f78',
    fontFamily: 'monospace',
  },
  error: {
    fontSize: 11,
    color: '#ed4245',
  },
};
