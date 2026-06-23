/**
 * Discord Embedded App SDK wrapper
 *
 * Initialises the SDK once and exports the singleton.
 * In local dev (outside Discord iframe), the SDK gracefully no-ops most calls
 * and we fall back to environment variables for user identity.
 */

import { DiscordSDK, DiscordSDKMock } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';

// Use the real SDK when running inside Discord; mock when running in browser
export const discordSdk = CLIENT_ID
  ? new DiscordSDK(CLIENT_ID)
  : (new DiscordSDKMock(CLIENT_ID, 'guild123', 'channel456') as unknown as DiscordSDK);

export interface DiscordContext {
  userId: string;
  username: string;
  discriminator: string;
  avatarUrl?: string;
  guildId: string;
  channelId: string;
  accessToken: string;
}

let _context: DiscordContext | null = null;

/**
 * Must be called once at app startup.
 * Resolves when the SDK is ready and OAuth is complete.
 */
export async function initDiscord(): Promise<DiscordContext> {
  if (_context) return _context;

  await discordSdk.ready();

  // OAuth2 token exchange
  const { code } = await discordSdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });

  // Exchange code for token via our backend
  const tokenRes = await fetch('/.proxy/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  const { access_token: accessToken } = await tokenRes.json();

  await discordSdk.commands.authenticate({ access_token: accessToken });

  // Fetch user info
  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const me = await meRes.json();

  const ctx = discordSdk.instanceId
    ? await discordSdk.commands.getChannel({ channel_id: discordSdk.channelId! })
    : null;

  _context = {
    userId: me.id,
    username: me.username,
    discriminator: me.discriminator,
    avatarUrl: me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
      : undefined,
    guildId: discordSdk.guildId ?? 'local',
    channelId: discordSdk.channelId ?? 'local',
    accessToken,
  };

  return _context;
}

/**
 * Dev-only: returns a fake context so the app works outside Discord.
 */
export function devContext(): DiscordContext {
  const id = `dev-${Math.random().toString(36).slice(2, 8)}`;
  return {
    userId: id,
    username: `DevUser_${id.slice(4)}`,
    discriminator: '0000',
    guildId: 'dev-guild',
    channelId: 'dev-channel',
    accessToken: 'dev-token',
  };
}
