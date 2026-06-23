# ─── Use the official Playwright image ───────────────────────────────────────
# This is the ONLY reliable way to run Chromium on Railway.
# The image ships with all system dependencies pre-installed.
# Pinned to a specific version to avoid surprise breakage.
# See: https://docs.railway.com/guides/playwright
FROM mcr.microsoft.com/playwright:v1.43.0-jammy

WORKDIR /app

# Install deps from the root of the monorepo
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/

# ci (not install) for deterministic builds
RUN npm ci --workspace=shared --workspace=backend

# No need to run `playwright install` — the image already has Chromium.
# But we DO need to tell Playwright where to find it:
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy source
COPY shared/ ./shared/
COPY backend/ ./backend/

# Build TypeScript
RUN npm run build --workspace=shared
RUN npm run build --workspace=backend

EXPOSE 3001

ENV NODE_ENV=production

# Chromium refuses to run as root with the sandbox enabled.
# --no-sandbox is already set in BrowserManager.ts args, which is fine
# for a trusted environment where we control the page content.
CMD ["node", "backend/dist/index.js"]
