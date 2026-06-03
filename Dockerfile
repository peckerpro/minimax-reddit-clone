# minimax-reddit-clone v3.0.0 — production Dockerfile
#
# Two-stage build keeps the runtime image small:
#   - build stage: full Node 22 image (for `npm install`-style deps, even
#     though we have none — we still need typescript/etc? no, vanilla JS).
#     We use it as the builder for parity with the npm-tooling path.
#   - runtime stage: node:22-bookworm-slim. The repo's "zero npm deps"
#     promise is honored — no `npm install` step runs in the build.
#
# Build:   docker build -t minimax-reddit-clone:3.0.0 .
# Run:     docker run --rm -p 5173:5173 -v reddit-data:/var/lib/reddit-clone \
#              -e SESSION_SECRET=$(openssl rand -hex 32) minimax-reddit-clone:3.0.0
#
# Notes:
#   * Healthcheck hits /api/health (which now pings the DB).
#   * SQLite WAL files (-wal, -shm) are siblings of the .db; the
#     volume mount must cover the whole data dir, not just reddit.db.
#   * Set SESSION_SECRET in production; the dev fallback re-rolls on
#     every boot and will log everyone out.

# ── build stage ───────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Copy package metadata first so a source-only change reuses the layer.
COPY package.json ./
# We have no runtime deps; `npm install` is a no-op except for
# creating node_modules. Skipping it is a 2× speedup on first build.
# `npm install --omit=dev` keeps it explicit; remove if you add devDeps.
RUN npm install --omit=dev --no-audit --no-fund || true
COPY . .
# Sanity: the boot script must exist
RUN test -f server/index.mjs

# ── runtime stage ──────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Non-root user. The /var/lib/reddit-clone dir is the data volume.
RUN groupadd --system --gid 1001 reddit \
 && useradd  --system --uid 1001 --gid 1001 --home /var/lib/reddit-clone reddit \
 && mkdir -p /var/lib/reddit-clone /app \
 && chown -R reddit:reddit /var/lib/reddit-clone /app

# Copy the built app. node_modules is empty (no deps) but the
# COPY preserves any tooling decisions (npm ci outputs etc).
COPY --from=build --chown=reddit:reddit /app /app

USER reddit
WORKDIR /app

# Data lives on a mounted volume. The default DB_PATH points inside
# the volume so SQLite's -wal / -shm sidecars stay in the same mount.
ENV NODE_ENV=production \
    PORT=5173 \
    DB_PATH=/var/lib/reddit-clone/reddit.db
EXPOSE 5173
VOLUME ["/var/lib/reddit-clone"]

# Healthcheck: /api/health returns {db:"up"} when the DB is
# queryable, 503 otherwise. Hit it every 30s; 5s timeout.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5173/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# M8.audit (B4): graceful shutdown needs the signal to reach the
# Node process. Docker sends SIGTERM by default on `docker stop`
# (with a 10s grace period). The server's SIGTERM handler drains
# in-flight requests and closes the DB cleanly.
CMD ["node", "server/index.mjs"]
