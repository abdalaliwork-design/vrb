# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY frontend/package*.json ./frontend/

RUN npm ci --workspace=shared --workspace=frontend

# Copy source and build
COPY shared/ ./shared/
COPY frontend/ ./frontend/

# VITE_DISCORD_CLIENT_ID is a build-time arg (public var, safe to bake in)
ARG VITE_DISCORD_CLIENT_ID
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID

RUN npm run build --workspace=shared
RUN npm run build --workspace=frontend

# ─── Serve stage ─────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# nginx config:
#   - Serves the React SPA (all routes → index.html)
#   - Proxies /.proxy/* → backend (set BACKEND_URL env var at runtime)
#     Railway injects the backend's private URL via BACKEND_INTERNAL_URL
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

# nginx envsubst will substitute $BACKEND_INTERNAL_URL at startup
CMD ["/bin/sh", "-c", "envsubst '$$BACKEND_INTERNAL_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
