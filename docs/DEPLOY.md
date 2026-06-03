# Deploying minimax-reddit-clone v3.0.0

> Self-hosted Reddit clone. Vanilla-JS SPA + Node 22 HTTP backend +
> SQLite (via `node:sqlite`). Zero npm dependencies. The whole repo
> is the deliverable; you clone it, run two commands, and you have
> a production Reddit-clone serving on `:5173` (or whatever `$PORT`).

## 1. Hardware baseline

The bench (`scripts/_bench.mjs --duration 10 --concurrency 32`) on
a 2023-era laptop, seed data (24 users / 25 subs / 40 posts), gives
the following baseline. Numbers scale linearly with the data size;
if you have 100k posts you'll need to add the indexes listed in
§5.

| Endpoint                       | p50    | p95    | p99    | rps     |
| ------------------------------ | -----: | -----: | -----: | ------: |
| `GET /api/health`              |  0.5ms |  1.4ms |  3.4ms |  5,743  |
| `GET /api/posts`                |  1.6ms |  2.2ms |  3.0ms |  2,344  |
| `GET /api/posts/:id`           |  1.1ms |  3.7ms |  8.2ms |  2,824  |
| `GET /api/posts/:id/comments`  |  1.2ms |  3.9ms |  9.2ms |  2,543  |
| `GET /api/subreddits`           |  1.5ms |  6.1ms | 11.5ms |  1,965  |
| `GET /api/search`               |  1.9ms |  7.1ms | 13.6ms |  1,639  |

**Single-process Node serves ~2k rps on reads at p99 < 15ms** for
the seed-data volume. For more, run multiple Node processes
behind a load balancer (the SQLite file is the only shared state;
SQLite WAL mode handles multiple readers + a single writer fine
for moderate write rates — see §4 for the multi-process
caveat).

## 2. First-time setup

```bash
# 1. Clone
git clone https://github.com/peckerpro/minimax-reddit-clone.git
cd minimax-reddit-clone

# 2. Pin Node 22 LTS
node --version   # must be >= 22.5 (we use node:sqlite)
# if wrong version: nvm install 22 && nvm use 22

# 3. Set a stable session secret (or sessions will be invalidated on
#    every process restart — fine for dev, painful in prod).
export SESSION_SECRET="$(node -e 'console.log(require(\"node:crypto\").randomBytes(32).toString(\"hex\"))')"
# paste that into your systemd unit (see §3) or your .env

# 4. Run migrations + seed from src/data/*.json on first boot
npm run migrate

# 5. Start
npm start
# → http://localhost:5173
```

There is no `npm install` step — the project has zero runtime
dependencies. The `node_modules` directory will be empty after
`git clone`.

## 3. systemd unit

Save as `/etc/systemd/system/reddit-clone.service`:

```ini
[Unit]
Description=minimax-reddit-clone v3.0.0
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=reddit
Group=reddit
WorkingDirectory=/opt/reddit-clone
Environment=SESSION_SECRET=<paste the 32-byte hex from §2 step 3>
Environment=NODE_ENV=production
Environment=PORT=5173
Environment=DB_PATH=/var/lib/reddit-clone/reddit.db
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=5
# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/reddit-clone
# SQLite WAL mode writes sidecar files (.db-wal, .db-shm) — allow them.
# (already covered by ReadWritePaths above)

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo useradd -r -d /opt/reddit-clone -s /usr/sbin/nologin reddit
sudo install -d -o reddit -g reddit /opt/reddit-clone
sudo install -d -o reddit -g reddit /var/lib/reddit-clone
sudo cp -r ./* /opt/reddit-clone/
sudo chown -R reddit:reddit /opt/reddit-clone

sudo systemctl daemon-reload
sudo systemctl enable --now reddit-clone
sudo systemctl status reddit-clone
journalctl -u reddit-clone -f
```

## 4. nginx reverse proxy + TLS

Save as `/etc/nginx/sites-available/reddit-clone`:

```nginx
upstream reddit-clone {
    # Pin to a single backend; scale by adding more upstream blocks
    # and `server` lines.
    server 127.0.0.1:5173;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name your.domain.example;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your.domain.example;

    ssl_certificate     /etc/letsencrypt/live/your.domain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain.example/privkey.pem;

    # Security headers — keeps the SPA's hash router happy
    # (no X-Frame-Options needed; we don't frame ourselves)
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Strict-Transport-Security "max-age=63072000" always;

    client_max_body_size 1m;  # generous; our largest POST is a comment body

    location / {
        proxy_pass http://reddit-clone;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/reddit-clone /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Get a cert: `sudo certbot --nginx -d your.domain.example`.

## 5. Database: backup + recovery

The DB is a single file: `/var/lib/reddit-clone/reddit.db`
plus its WAL sidecar. SQLite is durable — no daemon, no
connection pool. The simplest reliable backup is a daily
`sqlite3 .backup`:

```bash
# /etc/cron.daily/reddit-clone-backup
#!/bin/bash
set -euo pipefail
DB="/var/lib/reddit-clone/reddit.db"
DEST="/var/backups/reddit-clone"
install -d "$DEST"
# Use sqlite3's online backup API — safe while the app is running
sqlite3 "$DB" ".timeout 5000" ".backup '$DEST/reddit-$(date +%F).db'"
# Keep 14 days
find "$DEST" -name "reddit-*.db" -mtime +14 -delete
```

Install `sqlite3` (`apt install sqlite3` / `dnf install sqlite`).
For S3, swap the `sqlite3 .backup` line for `aws s3 cp` or
`rclone copy`. The `.backup` API holds a SHM lock briefly; under
load this can stall a few seconds — back up at low traffic.

### Restore

```bash
sudo systemctl stop reddit-clone
sudo cp /var/backups/reddit-clone/reddit-2026-01-15.db \
        /var/lib/reddit-clone/reddit.db
sudo chown reddit:reddit /var/lib/reddit-clone/reddit.db
sudo systemctl start reddit-clone
```

## 6. Scaling beyond one process

A single Node process + WAL-mode SQLite handles the seed-data
volume easily. To scale up:

- **Reads** (which are most of the traffic): run multiple Node
  processes behind nginx (the upstream block above shows how).
  SQLite WAL allows concurrent readers; the only contention is
  on the single writer, and most writes are sub-ms.

- **Writes**: don't run more than one writer process. The schema
  uses BEGIN/COMMIT via `server/db.mjs#tx()` and the
  `node:sqlite` library serializes writes per connection. If you
  add a second writer process, you'll start seeing `SQLITE_BUSY`
  errors. Easy fix: front the API with a write-rate limiter, or
  add a Redis-backed mutex.

- **Cache layer**: the posts feed (`/api/posts`) is the hot
  endpoint. Add a 5-10s `Cache-Control: public, max-age=5` header
  on the route (or a Redis cache) to absorb spikes. For our seed
  data the read p99 is already 3ms — caching is for 10k+ user
  loads, not for the current 24-user demo.

## 7. Observability

For a 24-user demo the systemd journal is enough:

```bash
journalctl -u reddit-clone -f
```

To add structured logs, edit `server/index.mjs` to pipe the
existing `console.log` / `console.error` calls through pino or
winston — the v2.x code has minimal logging (mostly the
`[migrate] applied ...` and `[reddit-clone] v3.0.0` startup
lines) so it's a one-file change.

## 8. npm scripts (all of them)

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm start`         | `node server/index.mjs` (uses `$PORT`, default 5173)  |
| `npm run dev`       | `node scripts/serve.mjs` — auto-finds a free port + runs migrations on boot |
| `npm run migrate`   | Apply pending SQL migrations + seed from `src/data/*.json` if DB is empty |
| `npm run migrate:no-seed` | Same but skip the auto-seed (CI / hot fixes)   |
| `npm run reset`     | Delete `data/reddit.db` and re-migrate (DESTRUCTIVE — local dev only) |
| `npm run bench`     | `node scripts/_bench.mjs` — perf baseline (5s, 8 concurrent per scenario) |
| `npm run e2e`       | `node scripts/_e2e.mjs` — full pipeline: register → post → vote → comment → report → mod resolves |
| `npm test`          | Runs `lint` + `test` + `api-test` (all in-process, no server needed) |

For CI: `npm test` is the gate. The bench and e2e are diagnostic
and not part of the green-build requirement.

## 9. Gotchas

- **Sessions reset on restart if you didn't set `$SESSION_SECRET`.**
  See §2 step 3. Without it, every boot re-rolls the HMAC key
  via `Date.now()`, and existing `rc_sid` cookies fail signature
  verification → 401 on every authenticated request. The
  Node 22+ pattern `process.env.SESSION_SECRET` in
  `server/auth.mjs` is the only thing that fixes this.

- **SQLite + Windows**: the `data/` directory uses forward
  slashes; node:sqlite handles Windows paths fine, but if you
  symlink the DB from an NTFS junction, symlink the whole
  `data/` directory, not the file (WAL sidecars won't follow
  the symlink).

- **Migrations are not down-migrations**. If you need to roll
  back a schema change, write a forward migration that
  undoes the previous one (e.g. `ALTER TABLE x ADD COLUMN y;
  later: ALTER TABLE x DROP COLUMN y` — SQLite supports
  `DROP COLUMN` since 3.35).

- **M8 ended here** but the read API is not yet paginated beyond
  `?limit=` (max 100) and `?after=`. If you grow past ~10k
  posts, add keyset pagination with a (created_at, id)
  composite cursor.

## 10. Support

- Read `docs/M3_BACKEND.md` for the API contract
- Read `docs/STATE_MACHINE.md` (v2.1.0) for the SPA's UI state machine
- Read `docs/V3_PLAN.md` for the v3.0.0 milestone breakdown
- Open an issue at https://github.com/peckerpro/minimax-reddit-clone/issues
