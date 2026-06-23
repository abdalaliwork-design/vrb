import React, { useEffect, useState } from 'react';
import { DiscordContext, initDiscord, devContext } from './lib/discord';
import { useWebSocket } from './hooks/useWebSocket';
import { useSession } from './hooks/useSession';
import { LobbyScreen } from './components/LobbyScreen';
import { ControlBar } from './components/ControlBar';
import { BrowserViewport } from './components/BrowserViewport';
import { StatusBar } from './components/StatusBar';

const IS_DEV = import.meta.env.DEV;

export default function App() {
  const [discordCtx, setDiscordCtx] = useState<DiscordContext | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const ws = useWebSocket();
  const session = useSession(ws, discordCtx);

  // Init Discord SDK
  useEffect(() => {
    const init = async () => {
      try {
        if (IS_DEV && !import.meta.env.VITE_DISCORD_CLIENT_ID) {
          // Local dev: use a fake context so we can work without Discord
          console.log('[App] Dev mode — using fake Discord context');
          setDiscordCtx(devContext());
        } else {
          const ctx = await initDiscord();
          setDiscordCtx(ctx);
        }
      } catch (err) {
        console.error('[App] Discord init failed:', err);
        setInitError(String(err));
        // Fall back to dev context so the app isn't completely broken
        setDiscordCtx(devContext());
      }
    };
    init();
  }, []);

  // Show lobby until we have an active session
  if (session.status !== 'active') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <LobbyScreen
          discordCtx={discordCtx}
          onStart={session.createOrJoinSession}
          connecting={session.status === 'connecting'}
        />
        <StatusBar
          connected={ws.connected}
          sessionId={null}
          error={session.error ?? initError}
        />
      </div>
    );
  }

  const { session: s, streamInfo, isController, isInQueue, queuePosition } = session;

  return (
    <div style={styles.root}>
      <ControlBar
        session={s!}
        userId={discordCtx?.userId ?? ''}
        isController={isController}
        isInQueue={isInQueue}
        queuePosition={queuePosition}
        onRequestControl={session.requestControl}
        onReleaseControl={session.releaseControl}
        onNavigate={session.navigate}
      />

      <BrowserViewport
        streamInfo={streamInfo}
        browserReady={s!.browserReady}
        isController={isController}
        sessionId={s!.id}
        ws={ws}
      />

      <StatusBar
        connected={ws.connected}
        sessionId={s!.id}
        error={session.error}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1f22',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#fff',
    overflow: 'hidden',
  },
};
