import React from 'react';
import { DiscordContext } from '../lib/discord';

interface LobbyScreenProps {
  discordCtx: DiscordContext | null;
  onStart: () => void;
  connecting: boolean;
}

export function LobbyScreen({ discordCtx, onStart, connecting }: LobbyScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🌐</div>
        <h1 style={styles.title}>BrowserSync</h1>
        <p style={styles.subtitle}>
          A shared browser for your voice channel.
          <br />
          One person drives — everyone watches.
        </p>

        {discordCtx && (
          <p style={styles.userInfo}>
            Signed in as{' '}
            <strong style={{ color: '#5865f2' }}>{discordCtx.username}</strong>
          </p>
        )}

        <button
          style={{
            ...styles.btn,
            opacity: connecting || !discordCtx ? 0.6 : 1,
            cursor: connecting || !discordCtx ? 'not-allowed' : 'pointer',
          }}
          onClick={onStart}
          disabled={connecting || !discordCtx}
        >
          {connecting ? 'Connecting…' : 'Open Shared Browser'}
        </button>

        <p style={styles.hint}>
          Opens or joins the session for this voice channel.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e1f22',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#fff',
  },
  card: {
    background: '#2b2d31',
    border: '1px solid #3b3d44',
    borderRadius: 16,
    padding: '40px 48px',
    maxWidth: 400,
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  logo: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: 14,
    color: '#b5bac1',
    lineHeight: 1.6,
    marginBottom: 24,
  },
  userInfo: {
    fontSize: 13,
    color: '#b5bac1',
    marginBottom: 24,
  },
  btn: {
    background: '#5865f2',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 28px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.15s',
  },
  hint: {
    marginTop: 16,
    fontSize: 12,
    color: '#6d6f78',
  },
};
