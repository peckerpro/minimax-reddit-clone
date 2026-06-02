# v3.0.0 — Full-stack Reddit Clone: Master Plan

> Owner: Mavis (orchestrator)
> Status: DRAFT — pending user sign-off
> Target release: v3.0.0 (semver major because we add a real backend)
> Replaces: v2.1.0 (FSM-aligned SPA + JSON mock data)
> Branch: `feature/v3.0.0-fullstack` in `D:\Minimax-project\reddit\.worktrees\feature-v3.0.0-fullstack`

## 0. 目标

把 `minimax-reddit-clone` 从"前端 SPA + JSON mock"升级到"前端 SPA + Node.js HTTP backend + SQLite + 真 auth + 真持久化"。前端 shell、FSM、组件结构保持向后兼容;数据层从 `src/data/*.json` fetch 切到 `fetch('/api/...')` 真接口。

**vibe coding 友好:**
- `npm run dev` 自动 migrate + 启动 backend + serve frontend
- `npm run reset-db` 重置
- 0 npm 依赖(node 22+ 内置 `node:sqlite` + `node:crypto` + `node:http`)
- 每次 backend 改 contract,前端 contract test 自动挂

## 1. 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| Runtime | **Node 22 LTS** (`>=22.5`) | 内置 `node:sqlite`,零 native binding |
| HTTP | 手写 router on `node:http` | 零依赖;沿用 `serve.mjs` 风格 |
| Database | 内置 `node:sqlite` 文件 `data/reddit.db` | 零 native binding,Windows 友好 |
| Sessions | HMAC 签名 cookie + SQLite session 表 | 不用 JWT |
| Password | `node:crypto.scrypt` + per-user salt | OWASP 推荐 KDF |
| Migrations | `migrations/NNNN_*.sql` + `scripts/migrate.mjs` | 幂等 |
| Frontend | 不变(vanilla JS + ESM + hash router) | FSM + 组件结构 100% 复用 |
| Tests | `node:test`(内置) | 跟 lint/test/walk 风格一致 |

## 2. Schema (11 张表)

users, sessions, subreddits, posts, comments, post_votes, comment_votes,
subscriptions, saved_posts, hidden_posts, followed_users, blocked_users,
blocked_subreddits, notifications, messages, coins_ledger, awards_given,
reports, drafts.

id 全 ULID,时间戳 ISO8601 TEXT。SQL 在 `migrations/`。

## 3. API

REST。`/api/auth/*`, `/api/posts`, `/api/posts/:id/comments`, `/api/posts/:id/vote`,
`/api/subreddits`, `/api/subreddits/:name/join`, `/api/users/:name/posts`,
`/api/users/:name/follow`, `/api/notifications`, `/api/messages`,
`/api/search`, `/api/health`, `/api/coins/*`, `/api/awards/give`, etc.

完整 contract 在 `docs/M3_BACKEND.md`(M0 末写)。

## 4. 里程碑

| M | 名称 | 估时 | 任务 |
| --- | --- | --- | --- |
| M0 | Bootstrap | 3d | 升 Node 22,后端骨架,SQL migrations,`/api/health` |
| M1 | Auth | 3d | register/login/logout/me,cookie session,前端 `auth.js` |
| M2 | Read API | 4d | 全部 GET 端点,前端 `api.js` 切 fetch |
| M3 | Write API (vote) | 2d | 投票/保存/隐藏 + karma 触发器 |
| M4 | Write API (post) | 3d | 发帖/评论/草稿/sub 加入 |
| M5 | Social | 3d | follow/block/通知/私信 |
| M6 | Admin/Safety | 2d | 举报队列 |
| M7 | Polish | 4d | dark mode + 移动端 + 一键 dev |
| M8 | Hardening | 3d | 性能/e2e/deploy doc |

合计 ~27 工作日,前后端并行 12-14 天上线。

## 5. Agent 团队

`.harness/reins/`(已创建 6 个):
- **pm** — master plan / FSM / API contract 文档
- **backend-coder** ×2 — `server/`, `migrations/`, `scripts/migrate.mjs`
- **frontend-coder** ×2 — `src/js/**`,FSM 实现
- **reviewer** — PR 闸门
- **tester** — contract + e2e
- **devops** — `npm run dev` / Dockerfile / deploy

## 6. 数据迁移

`scripts/migrate.mjs` 启动时:DB 空 → 从 `src/data/*.json` 灌入。`npm run reset-db` 删 `data/reddit.db` 重来。

## 7. 文件结构(新增)

```
server/                 # 后端
  index.mjs
  router.mjs
  db.mjs
  auth.mjs
  handlers/
  middleware/
  lib/
  test/contract/
migrations/             # SQL
data/                   # 运行时,gitignore
scripts/migrate.mjs
scripts/reset-db.mjs
docs/M3_BACKEND.md      # API 契约
docs/DEPLOY.md
```

## 8. 风险

| 风险 | 对策 |
| --- | --- |
| Node 22 没装 | README 顶部 `nvm install 22 && nvm use 22` |
| `node:sqlite` Windows 差异 | M0 末三平台跑通;contract test 锁行为 |
| Karma 漂移 | Reviewer 强制每条 write API 有 transaction + trigger 单元测试 |
| v2.x localStorage 投票/草稿不同步 | M1: 登录时 batch sync 到 server |
| Schema bug | M0 拆 4 步,每步 contract test |
| 性能 | M2 covering index;M8 压测 |
