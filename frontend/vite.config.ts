import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Discord Activities run inside an iframe on discordapp.com. The Discord
 * client proxies requests through:
 *   https://<CLIENT_ID>.discordsays.com/.proxy/
 *
 * In local dev we rewrite /.proxy/ to our local backend so everything works
 * without SSL. The VITE_DISCORD_CLIENT_ID env var must be set.
 *
 * See: https://discord.com/developers/docs/activities/development-guides
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/.proxy': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/.proxy/, ''),
        ws: true, // proxy WebSocket upgrades too
      },
    },
  },
  resolve: {
    alias: {
      '@discord-browser/shared': '../shared/src',
    },
  },
});
