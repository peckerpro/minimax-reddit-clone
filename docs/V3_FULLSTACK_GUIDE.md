# minimax-reddit-clone v3.0.0 — 从零开始的全栈实现

> 目标读者:接手维护 / 二次开发 / 想照着学一遍"无框架、零依赖、
> 单仓全栈"的同学。

---

## 0. 这是个什么东西

一个对 reddit.com 的**高保真**复刻,**单仓**包含:

- **前端** —— 原生 JS + ESM,hash router,3 栏 Reddit 风格布局,
  30 个完整组件(header / left-nav / feed / post-card / vote-column /
  post-detail / 嵌套评论 / 模态框 / 通知中心 / 站内信 / 主题切换 / ...),
  没有任何打包器。
- **后端** —— Node 22+ `node:http` 起的纯手写 router,
  70+ 个 REST 端点,scrypt + HMAC cookie session,无状态服务。
- **数据库** —— `node:sqlite`(Node 内置),WAL 模式,
  19 张表、24 个索引,首启自动从 `src/data/*.json` 灌种子数据。
- **可观测性** —— 每条 `/api/*` 请求一行时间戳日志,
  `/api/health` 真探活,SIGTERM/SIGINT 优雅排空。
- **部署** —— `Dockerfile`(两阶段、非 root、healthcheck)、
  `docker-compose.yml`、`docs/DEPLOY.md` 的 systemd + nginx 模板、
  `sqlite3 .backup` 每日备份脚本。

**核心约束**:**运行时零 npm 依赖**(`engines.node` ≥ 22.5)。
`node_modules` 在仓库里是空的。要复现,只需要 `git clone && npm start`。
这也是为什么你会看到 `node:crypto`、`node:http`、`node:sqlite`、
`node:fs/promises`、`node:path` 这种写法——全是 Node 22+ 内置模块。

---

## 1. 关键设计决策(读这一节,后面就顺了)

| 决策 | 选项 | 选了 | 为什么 |
|---|---|---|---|
| Web 框架 | Express / Fastify / Koa / 手写 | **手写** | 70 个端点的注册语法可以直接看 `server/index.mjs` 一眼到底;教学价值高;零依赖 |
| 路由 | express-router / radix3 / 手写链 | **手写链 + 占位符** | 路由表只有 ~40 条,O(n log n) 排序在每次 handle() 跑一次可忽略;且能精确控制 literal-wins 优先级 |
| DB | PostgreSQL / MySQL / SQLite | **node:sqlite** | 部署 = 一个文件;WAL 模式并发读 + 单写够用;不需要运维数据库 |
| 密码哈希 | bcrypt / argon2 / scrypt | **scrypt** | Node 内置;参数 (N=2^14, r=8, p=1) 在 2024+ 笔记本上 ~50ms;argon2 需要 npm 包 |
| 会话 | Redis / JWT / Cookie | **HMAC 签名 cookie** | 无状态(重启不掉登录需要靠 `$SESSION_SECRET` 持久化);零依赖;`rc_sid=<sid>.<sig>`,HttpOnly + SameSite=Lax |
| ORM | better-sqlite3 / Knex / Sequelize / 手写 SQL | **手写 SQL** | 19 张表、~30 条 SQL,ORM 的抽象成本不划算;prepared statement 手写也清晰 |
| 前端路由 | History API / Hash | **Hash** | 纯静态文件 + 任何后端都能 serve,index.html 单文件,SPA fallback 简单 |
| 前端状态 | Redux / MobX / 手写订阅 | **手写 state + subscribe** | 全局 `state.subscribe(fn)`,组件在订阅回调里重渲染;`feed.js`/`header.js` 都用这个 |
| 构建工具 | webpack / vite / esbuild | **无** | 浏览器原生支持 ESM + import maps;`scripts/serve.mjs` 直接 serve |
| 部署 | Docker / systemd / PM2 | **三种都给** | Docker 给"5 分钟跑起来",systemd 给"裸机/VPS",本地直接 `npm start` |

> **零依赖 ≠ 没有成本。** 它意味着:你需要自己写分页、自己处理
> CORS、自己写 session 自己写 cookie。`docs/DEPLOY.md` §9 总结了几个
> 真实坑(session 重启丢、SQLite 备份锁、migration 不能 rollback)。

---

## 2. 仓库布局

```
minimax-reddit-clone/
├── index.html                  SPA 入口(只有 ~30 行,挂 #root)
├── package.json                只有 scripts + 依赖声明(dependencies: [])
├── Dockerfile                  两阶段,非 root,healthcheck
├── docker-compose.yml          命名卷 + SESSION_SECRET 必填
├── README.md                   5 分钟跑起来
├── AGENTS.md                   项目记忆(给 AI agent 看)
├── CHANGELOG.md                所有版本
│
├── docs/                       你现在读的这篇在 docs/V3_FULLSTACK_GUIDE.md
│   ├── README.md               文档索引
│   ├── V3_PLAN.md              v3.0.0 拆分计划
│   ├── V3_FULLSTACK_GUIDE.md   本文档
│   ├── M3_BACKEND.md           M3 后的 API 完整契约
│   ├── DEPLOY.md               systemd + nginx + TLS + 备份
│   ├── versions/               每个版本的 changelog
│   └── analysis/               v2.x FSM / Reddit 真实爬取
│
├── migrations/                 SQL 迁移,按序号加载
│   ├── 0001_init.sql           19 张表 + 24 个索引
│   ├── 0002_moderation.sql     M6:removed_at/resolved_at
│   └── 0003_notif_dedup.sql    M8.1:UNIQUE 索引去重 notif
│
├── server/                     后端(Node,所有 .mjs,ESM)
│   ├── index.mjs               入口:createServer + 路由挂载 + 优雅停机
│   ├── auth.mjs                scrypt + HMAC + cookie 工具
│   ├── router.mjs              手写 router(literal-wins 排序)
│   ├── db.mjs                  node:sqlite 连接 + tx() 包装
│   ├── lib/
│   │   ├── errors.mjs          统一错误格式
│   │   ├── body.mjs            256KB 上限的 JSON body 解析
│   │   ├── ulid.mjs            ULID 生成
│   │   ├── posts.mjs           排序 + 分页 + 时间过滤
│   │   └── notifications.mjs   fireNotification(去重 + 触发)
│   ├── middleware/
│   │   ├── auth-required.mjs   读 cookie,设 ctx.user
│   │   └── rate-limit.mjs      限流(5/5s 登录,5/60s 注册)
│   └── handlers/               按域分文件
│       ├── health.mjs
│       ├── auth.mjs            /api/auth/{register,login,logout,me}
│       ├── subreddits.mjs      /api/subreddits
│       ├── posts.mjs           /api/posts + 详情 + 评论 + related
│       ├── users.mjs           /api/users + saved + hidden
│       ├── search.mjs          /api/search
│       ├── interactions.mjs    投票 / 收藏 / 隐藏
│       ├── content.mjs         发帖 / 发评 / 草稿 / 创建子版 / 报告
│       ├── social.mjs          订阅 / 关注 / 拉黑 / 通知 / 站内信
│       └── admin.mjs           报告队列 + 决议
│
├── server/test/contract/       node:test 的契约测试
│   ├── _helpers.mjs            mkRes / mkBodyReq / withCtx / freshApp
│   ├── auth.test.mjs           14 cases
│   ├── interactions.test.mjs   16 cases
│   ├── content.test.mjs        23 cases
│   ├── social.test.mjs         29 cases
│   ├── admin.test.mjs          10 cases
│   ├── removed-content.test.mjs 8 cases
│   └── audit-fixes.test.mjs    M8.1 的 B1-B6 + N2(6 cases)
│
├── scripts/                    跑测试 / 跑迁移 / 跑 dev server / 跑 bench
│   ├── serve.mjs               找空闲端口 + 启动 + 自动迁移
│   ├── migrate.mjs             跑 migrations/ + 种子
│   ├── reset-db.mjs            删 + 重建
│   ├── health.mjs              curl /api/health
│   ├── lint.mjs                文件非空 + 大括号配对
│   ├── test.mjs                JSON 解析 + 文件读取
│   ├── api-test.mjs            api.js 60 个方法的对拍
│   ├── walk.mjs                抓所有 import 验证不 404
│   ├── smoke.mjs               _smoke-m2..m6 串联
│   ├── _smoke-m{2,3,4,5,6}.mjs  每里程碑的真请求
│   ├── _e2e.mjs                端到端:注册→发帖→投票→评论→报告→管理
│   ├── _bench.mjs              p50/p95/p99/rps 基线
│   ├── hold-port.mjs           占住端口(测试用)
│   ├── build.mjs               (空)打包占位
│   └── dryrun.mjs              (空)干跑占位
│
├── src/                        前端(SPA,所有 .js,ESM,无打包)
│   ├── index.html 在仓库根    ↑ 唯一引到这里
│   ├── css/                    20 个 CSS 文件,按组件拆
│   ├── data/                   种子 JSON(comments/posts/related/
│   │                           rules/subreddits/users)
│   ├── js/
│   │   ├── main.js             入口;注册所有 router.add()
│   │   ├── router.js           hash router
│   │   ├── state.js            全局 state + subscribe + localStorage 持久化
│   │   ├── auth.js             登录态 / fetch 包装
│   │   ├── api.js              60 个 API 方法(fetch)
│   │   ├── shell.js            header / drawer / sidebar
│   │   ├── utils/{dom,format,icons,theme}.js
│   │   └── components/         30 个组件,每个一个文件
│   └── ...
│
├── data/                       运行时生成(被 .gitignore)
│   └── reddit.db + .db-wal + .db-shm
│
└── .harness/                   6 个 rein 配置(给 AI agent 团队用)
    └── reins/{pm,backend-coder,frontend-coder,reviewer,tester,devops}/agent.md
```

---

## 3. 从零开始构建 — 按 M0..M8 顺序

每个里程碑都有自己的 commit,你可以 `git checkout <sha>` 跳到任意
阶段。所有 commit 都在 `feature/v3.0.0-fullstack` 分支。

```
M0:  a5e732b  server skeleton + SQLite migrations + /api/health
M1:  7ca2cc4  real auth — register/login/logout/me end-to-end
M2:  b466ae2  read API — /api/posts, /api/subreddits, /api/users, /api/search
M2.5: 79ba3b2 src/js/api.js → fetch(前端第二半)
M3:  9d354b5  votes/save/hide — write API + karma triggers
M4:  e1cea43  content writes — submit post/comment/drafts/sub create/reports
M5:  ad6c9fd  social graph — subscribe/follow/block/notifications/messages
M6:  ea3732e  admin / safety — notification triggers + report queue + mod actions
M7:  93bf813  polish — removed-content filter + dark mode + admin page + mobile
M8:  d5f44de  hardening — perf baseline + e2e + DEPLOY.md + scripts + v3.0.0
M8.1: 5df6eb9 audit fixes — comment parentId, notif UNIQUE, rate limit, ...
```

下面按这个顺序讲"每一步做了什么、为什么这么做、坑在哪"。

---

### M0 — 服务器骨架

**目标:**能起来、能连 SQLite、能在 `/api/health` 返回 200。

- **目录约定:** `server/` 是后端,`src/` 是前端。后端 ESM,
  `package.json` 里 `"type": "module"`。前端也是 ESM,浏览器原生。
- **DB 连接 (`server/db.mjs`):** 懒连接;`PRAGMA foreign_keys = ON`
  + `journal_mode = WAL` 在连接句柄上设(不能在 migration body 里,
  见 §6.1)。
- **迁移系统 (`scripts/migrate.mjs`):** 启动时按文件名排序
  跑 `migrations/*.sql`,记到 `_migrations` 表。失败抛错,
  下次启动会跳过已跑的、只跑新的。**没有 down migration** —
  写一个向前修复的 SQL(见 `migrations/0002_moderation.sql` 给现有表
  加列)。
- **路由骨架 (`server/router.mjs`):** 极简,只支持
  `add(method, path, handler)` + `use(mw)`,路径里用 `:name` 表占位符。
  匹配按 `matchPath()` 拆段,占位符会被 `decodeURIComponent`
  后塞进 `params`。
- **请求日志 (M8.audit B6):** `server/index.mjs` 包了一个
  `res.on("finish", ...)` 钩子,对 `/api/*` 打一行
  `[req] <ts> <method> <path> <status> <bytes> <duration>ms`。
  静态文件不打(不然 `/css/*.css` 刷屏)。
- **优雅停机 (M8.audit B4):** SIGTERM/SIGINT 触发 `server.close()`
  排空在途请求 → 关 DB → 50ms 后 exit;5s 兜底硬退。

**怎么验证:**
```bash
node scripts/migrate.mjs
node server/index.mjs
curl http://localhost:5173/api/health
# → {"status":"ok","db":"up","version":"3.0.0"}
```

---

### M1 — 真实身份认证

**目标:**能注册、能登录、能拿到自己。

- **密码学 (`server/auth.mjs`):**
  - **scrypt(password, salt, 64, {N: 2^14, r: 8, p: 1, maxmem: 64MB})**
    把密码和 per-user 16B 随机盐哈希成 64 字节 hex。
    验证用 `timingSafeEqual` 防侧信道。
  - **HMAC-SHA256** 用 `SESSION_SECRET` 给 session id 签名,
    cookie 是 `rc_sid=<sid>.<sig>`。
  - **`$SESSION_SECRET` 必须是 32 字节 hex**;不设的话会用
    `sha256("minimax-dev-${pid}-${now}")` 当 fallback,
    **每次重启失效** — 见 `docs/DEPLOY.md` §9。
- **Session 存哪 (`sessions` 表):** 服务端无状态,只在 cookie
  里放 sid+sig;sessions 表存 sid → user_id + expires_at(30 天 TTL)。
  登出 = 删这一行 + 清 cookie。
- **限流(M8.audit B3):** 登录 5 次/5s,注册 5 次/60s,按 `ctx.ip`
  计数。**注意:`rate-limit.mjs` 是高阶包装而不是中间件** —
  见 §6.3。
- **前端 (`src/js/auth.js` + `src/js/components/login.js`):**
  登录态 = 浏览器拿不到(cookie 是 HttpOnly),SPA 只能问
  `GET /api/auth/me` 来确认;失败了跳登录。

**怎么验证:**
```bash
curl -X POST http://localhost:5173/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"alice","email":"a@x.com","password":"hunter22"}'
# → 201 { user, sessionExpiresAt } + Set-Cookie: rc_sid=...
```

---

### M2 — 读 API(只读 GET)

**目标:**SPA 能从真后端拿数据,不再用 mock JSON。

- **数据形状规范:** 每个 list 端点返回 `{ items, next?, total? }`
  或者裸数组(看端点)。
  - `?limit=` 1-100,默认 25
  - `?after=` 时间游标(`created_at < after`)
  - `?sort=` hot | new | top | rising
  - `?t=` hour | day | week | month | year | all(只对 top)
- **路由排序(M8.audit):** 关键 bug。
  之前按注册顺序匹配,`/api/posts/saved`(字面)被
  `/api/posts/:id`(占位符)抢先,id="saved" → 404。
  修复:Router 每次 `handle()` 都把 `this.routes.slice().sort((a, b) => a.placeholders - b.placeholders)`,
  0 占位符的字面路径一定先匹配(`Array.sort` 稳定,同 tier 按注册序)。
- **读 SQL 都带 `removed_at IS NULL`:** M6 之后,删除的帖子
  应该 404 而不是显示占位,这个过滤从 M2 就开始加,见 M7 §。
- **前端 (M2.5):** `src/js/api.js` 从 `import` 静态 JSON 改成
  `fetch('/api/...')`。`scripts/api-test.mjs` 改用 mock fetch
  验证所有 60 个方法返回正确形状。

**怎么验证:**
```bash
curl http://localhost:5173/api/posts?sort=new&limit=5
# → [{...5 posts newest first...}]

curl http://localhost:5173/api/posts/p_abc/comments
curl http://localhost:5173/api/subreddits/technology/posts
```

---

### M3 — 写 API:投票/收藏/隐藏

**目标:**SPA 能"动手"了,数据真的落库。

- **投票是 4 态机:** `none → up → down → none`(再次点 up 取消)。
  后端 `interactions.mjs` 在**一个事务**里:
  1. 读当前 vote
  2. 算 delta(score_delta, karma_delta)
  3. UPSERT `post_votes` / `comment_votes`
  4. UPDATE 父对象的 `score` 和作者的 `karma`
  5. (可选)触发 `fireNotification`
- **收藏/隐藏:** 简单 toggle 行,`saved_posts` / `hidden_posts`
  是 user_id + post_id 的两列表。
- **notif 去重(M8.1 B2):** `migrations/0003_notif_dedup.sql` 加
  `UNIQUE INDEX uq_notif_target(user_id, kind, source_kind, source_id)`。
  生产 `fireNotification` 先 SELECT,没找到再 INSERT,捕
  `SQLITE_CONSTRAINT_UNIQUE` 兜底。
- **前端乐观更新:** `src/js/state.js#togglePostVote` 立刻改
  本地 state(已点赞→分数+1),再 await API;失败就回滚。

**怎么验证:**
```bash
curl -X POST http://localhost:5173/api/posts/p_abc/vote \
  -H 'Content-Type: application/json' \
  -b 'rc_sid=...' \
  -d '{"direction": 1}'
# → { ok: true, userVote: 1, score: 11 }
```

---

### M4 — 内容创建

**目标:**发帖子、发评论、存草稿、创建子版、举报。

- **POST `/api/posts`:** kind ∈ {text, link, image},text 必 body,
  link 必 url,自动 extract domain。返回完整 `Post` shape。
- **POST `/api/posts/:id/comments`:** 顶层或回复(`parentId`)。
  - **B1 修复(M8.1):** `parentId` 必须属于同一个 post,否则 404。
    跨 post 引用评论在 M3 vote notif 之前是想过的功能,被砍了,
    这条校验从一开始就该有。
  - 评论建表: `path` 字段存 `parent.path + "/" + id`,
    `depth` = path 段数 - 1。建索引 `idx_comments_post` /
    `idx_comments_parent` / `idx_comments_author`。
  - top-level 评论给 post 作者发 reply notif;reply 评论给
    parent 评论作者发 reply notif;自评不发。
- **POST `/api/subreddits`:** 创建子版(name 3-21 字符,正则
  `^[a-z0-9_]{3,21}$`)。第一版主是创建者,自动订阅。
- **POST `/api/reports`:** 任何 user 可举报任何 post/comment。
  reasons 是固定枚举(slur, spam, ...)。`targetExists: true/false`
  即使 target 被删也接受(避免报告消失)。
- **草稿:** `POST /api/drafts` + `PATCH /api/drafts/:id` +
  `DELETE /api/drafts/:id` + `GET /api/drafts`。`idx_drafts_user_ts`
  让 list 走 user_id + ts DESC 索引。

**怎么验证:**
```bash
curl -X POST http://localhost:5173/api/posts/p_abc/comments \
  -H 'Content-Type: application/json' \
  -b 'rc_sid=...' \
  -d '{"body": "great post!", "parentId": "c_xyz"}'
# → 201 { id: c_..., path: "/c_xyz/c_...", depth: 1, ... }
```

---

### M5 — 社交图

**目标:**订阅、关注、拉黑、通知中心、站内信。

- **订阅 / 关注 / 拉黑 都是 toggle:** `POST /api/.../:name/...`
  body `{"action": "join"|"leave"}`,幂等。
- **拉黑列表过滤:** 拉黑的人/子版的内容从 `listPosts` /
  `listComments` 里过滤掉。在每个 read handler 里 join 一次
  `blocked_users` / `blocked_subreddits` 即可,SQLite WAL 模式下
  这个 join < 5ms。
- **通知:** `notifications` 表 + 多种 trigger(评论、回复、投票、
  关注、报告解决)。`GET /api/notifications?unread=true` 走
  `idx_notifications_user_unread`(partial index on `read = 0`)。
- **站内信:** `messages` 表,inbox = `to_user_id = me`,
  sent = `from_user_id = me`。`POST /api/messages` 校验不能
  给自己发(403)。

---

### M6 — 管理

**目标:**有坏人内容能删、有报告能处理。

- **软删除:** `posts` 和 `comments` 加 `removed_at` + `removed_by`。
  所有 read handler 加 `WHERE removed_at IS NULL`。
  **M8.audit 决定:** 返回 404 而不是 410(avoid info leak —
  让攻击者猜不出"这个 post 存在但被删了"还是"根本没这个 id")。
- **报告处理:** `POST /api/admin/reports/:id/resolve` body
  `{action: "dismiss" | "remove_content"}`。
  - `dismiss`: `resolved_at` + `resolution = 'dismissed'`
  - `remove_content`: 软删 + 在 reports 行记 `resolution = 'removed'`
  - 已处理再处理 → 409
  - 非 admin → 403
- **admin 角色:** 业务里没注册时设 admin 的接口;`scripts/_e2e.mjs`
  里直接 `db.prepare("UPDATE users SET role='admin' WHERE id=?").run(...)`。
  生产应该是单独的人为流程。

---

### M7 — 打磨

- **深色模式:** `prefers-color-scheme` 检测 + `[data-theme="dark"]`
  CSS 变量切换。`state.theme` 持久化。
- **移动端:** `@media (max-width: 600px)` 把 left-nav 折成 drawer,
  feed 改单列,header 简化为 logo + 汉堡。
- **404 页:** `#/404` 状态,`not-found.js` 组件。
- **错误边界:** `shell.js` 包了 try/catch,未捕获错误弹 toast。

---

### M8 — 加固(发车准备)

- **`scripts/_bench.mjs`:** 5s 跑 6 个 GET 场景 × 8 并发,
  输出 p50/p95/p99/rps。基线 = seed 数据下 p99 < 30ms,
  ~2k rps 读。
- **`scripts/_e2e.mjs`:** 12 步端到端
  (register → post → comment → reply → vote → subscribe →
  report → admin promote → admin resolve → 404 验证 → 列表验证)。
- **`docs/DEPLOY.md`:** systemd unit、nginx 反代、TLS、
  `sqlite3 .backup` 每日备份、扩多进程的注意点。
- **`package.json` v3.0.0 scripts:** 9 个 `npm run *`,
  把上面所有脚本都接好。
- **发 tag:** `git tag -a v3.0.0 -m "v3.0.0: fullstack"`,
  `git push origin v3.0.0`。
- **v2.1.0 tag 也保留**(兼容读;`docs/versions/v2.1.0.md` 有记录)。

---

### M8.1 — 审计修复(M8 之后)

8 个 issue(B1-B6 重要,N1-N3 加分),全部 commit `5df6eb9`。
详表见 §5;本节挑两个最"教育意义"的:

- **B3 限流第一次写错:** 我一开始按 Express 习惯写了
  `rateLimit({...})` 返回一个 `(req, res, ctx, next) => {}`,
  登录超限就 res.end(429),不超限就 `next()`。
  问题:本仓库 Router 的 per-route handler 签名是
  `(req, res, ctx, params)`,**不是** `(req, res, ctx, next)`。
  后果:不超限时 `next` 是 `params`(一个对象),`next()` 立刻
  `TypeError: next is not a function`;而如果忘了 `next()`,
  那个请求就**静默掉到默认 200 空响应**。
  修复:改成高阶包装 `rateLimit({...})(handler) → wrappedHandler`,
  不超限时 `return handler(req, res, ctx, params)`。
  **这条记到了 agent memory(§6.3)。**

- **B2 notif dedup:** 加了 UNIQUE 索引后,`server/test/contract/social.test.mjs`
  里的 `insertNotification` 辅助函数(直接 `db.prepare().run()`)
  立刻爆,两个 case 的 `assert.equal(body.length, 1)` 还因为
  重复 dedup 成 1 行也对不上。修两处:helper 加 pre-SELECT 查重,
  两个 case 用不同的 `sourceId`。

---

## 4. 数据模型(19 张表 + 24 个索引)

全在 `migrations/0001_init.sql`。下面只列每张表的关键列,
完整 DDL 看源文件。

| 表 | 关键列 | 备注 |
|---|---|---|
| **users** | `id`, `name`(unique), `email`(unique), `password_hash`, `salt`, `karma`, `role`(user\|admin), `avatar_color`, `bio`, `created_at` | scrypt 存储 |
| **sessions** | `id`(sid), `user_id`, `expires_at`, `created_at` | 30 天 TTL,登出删 |
| **subreddits** | `id`, `name`(unique), `display_name`, `description`, `category`, `member_count`, `created_at` | 名字 3-21 字符 `[a-z0-9_]` |
| **posts** | `id`, `subreddit_id`, `author_id`, `kind`, `title`, `body`/`url`/`image_url`, `score`, `upvotes`, `downvotes`, `comments_count`, `domain`(links), `removed_at`, `removed_by`, `created_at` | 软删 |
| **comments** | `id`, `post_id`, `parent_id`(null=顶层), `author_id`, `body`, `path`, `depth`, `score`, `removed_at`, `created_at` | `path` 让嵌套查询 O(depth) |
| **post_votes** | `post_id`, `user_id`, `direction`(1\|-1), `created_at` | UNIQUE(post_id, user_id) |
| **comment_votes** | 同上 | UNIQUE(comment_id, user_id) |
| **subscriptions** | `subreddit_id`, `user_id`, `created_at` | UNIQUE |
| **saved_posts** | `user_id`, `post_id`, `created_at` | UNIQUE(M8.1 N2) |
| **hidden_posts** | `user_id`, `post_id`, `created_at` | UNIQUE(M8.1 N2) |
| **followed_users** | `follower_id`, `followee_id`, `created_at` | UNIQUE |
| **blocked_users** | `blocker_id`, `blocked_id`, `created_at` | UNIQUE |
| **blocked_subreddits** | `blocker_id`, `subreddit_id`, `created_at` | UNIQUE |
| **notifications** | `id`, `user_id`, `kind`, `source_kind`, `source_id`, `actor_id`, `read`, `created_at` | UNIQUE INDEX(M8.1 B2) |
| **messages** | `id`, `from_user_id`, `to_user_id`, `body`, `created_at` | 不能自发自收 |
| **coins_ledger** | `user_id`, `delta`, `reason`, `created_at` | 预留(目前只 +1 注册奖励) |
| **awards_given** | `giver_id`, `target_kind`, `target_id`, `award_id`, `created_at` | UI 有 awards,逻辑留给下版本 |
| **reports** | `id`, `reporter_id`, `target_kind`, `target_id`, `reason`, `resolved_at`, `resolved_by`, `resolution` | admin 处理 |
| **drafts** | `id`, `user_id`, `subreddit_id`, `kind`, `title`, `body`, `url`, `ts` | 用户的草稿箱 |

**时间戳格式:** 全部 `TEXT` 存 ISO 8601(`new Date().toISOString()`)。
优点:`ORDER BY created_at DESC` 直接走字符串字典序,等价时间序;
缺点:比对慢、加减时间得解析。v3.0.0 选了 ISO,够用。

**软删除模式:**
```sql
ALTER TABLE posts ADD COLUMN removed_at TEXT;  -- 0002_moderation.sql
ALTER TABLE posts ADD COLUMN removed_by TEXT;
-- 0001 之后的所有 read handler 必须:
SELECT ... FROM posts WHERE removed_at IS NULL;
```

**关键索引:**
- 列表 feed:`idx_posts_sub_created(subreddit_id, created_at DESC)` /
  `idx_posts_author_created(author_id, created_at DESC)` /
  `idx_posts_created(created_at DESC)`
- 评论:`idx_comments_post(post_id, created_at)` /
  `idx_comments_parent(parent_id)` /
  `idx_comments_author(author_id, created_at DESC)`
- 通知 unread 计数:
  `CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read) WHERE read = 0;`
  (partial index,只索引未读,小很多)
- notif 去重(M8.1):
  `CREATE UNIQUE INDEX uq_notif_target ON notifications(user_id, kind, source_kind, source_id);`

---

## 5. API 完整列表(70+ 端点)

**通用约定:**
- 所有非 2xx 返回 `{ "error": "<code>", "message": "...", "fields"?: {...} }`
- `error` 枚举:`unauthorized` / `forbidden` / `not_found` / `invalid` /
  `conflict` / `rate_limited` / `internal`
- 需要鉴权的端点: cookie `rc_sid` 必须存在且未过期;`ctx.user` 为 null
  直接 401
- 自操作的禁止(投票自己 403、关注自己 403、给自己发消息 403、...)
- 软删除的资源 → 404(避免信息泄露)

### Auth (4)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| POST | `/api/auth/register` | no | 限流 5/60s;返回 user + Set-Cookie |
| POST | `/api/auth/login` | no | 限流 5/5s |
| POST | `/api/auth/logout` | yes | 清 cookie + 删 session 行 |
| GET | `/api/auth/me` | yes | 返回 user 或 401 |

### Posts (7)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/posts` | no | `?sort=`, `?t=`, `?limit=`, `?after=`, `?sub=`, `?author=` |
| GET | `/api/posts/saved` | yes | M8.1 N2,跨设备 |
| GET | `/api/posts/hidden` | yes | M8.1 N2,跨设备 |
| GET | `/api/posts/:id` | no | 404 if removed |
| GET | `/api/posts/:id/comments` | no | 扁平数组,前端树化 |
| GET | `/api/posts/:id/related` | no | 同 sub 的 hot |
| POST | `/api/posts` | yes | text/link/image,需 title + subreddit |

### Comments (3)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| POST | `/api/posts/:id/comments` | yes | `body`, 可选 `parentId`(必须同 post) |
| PATCH | `/api/comments/:id` | owner | 留给下版本(未实现) |
| DELETE | `/api/comments/:id` | owner | 软删 |

### Subreddits (4)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/subreddits` | no | `?category=`, `?q=` |
| GET | `/api/subreddits/popular` | no | 按 member_count desc |
| GET | `/api/subreddits/:name` | no | 404 if not found |
| POST | `/api/subreddits` | yes | name 3-21 字符 |

### Users (4)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/users/:name` | no | 公资料 |
| GET | `/api/users/:name/posts` | no | `?sort=`, `?t=` |
| GET | `/api/users/:name/comments` | no | 留 |
| POST | `/api/users` | yes | 留,改资料在 PATCH /api/users/:name |

### Search (1)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/search?q=&type=posts\|subreddits\|users` | no | case-insensitive LIKE |

### Interactions (6)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| POST | `/api/posts/:id/vote` | yes | `{direction: 1\|-1\|0}`;notif dedup |
| POST | `/api/comments/:id/vote` | yes | 同上 |
| POST | `/api/posts/:id/save` | yes | toggle |
| POST | `/api/posts/:id/hide` | yes | toggle |
| POST | `/api/posts/:id/crosspost` | yes | 留,下版本 |
| POST | `/api/posts/:id/award` | yes | 留,下版本 |

### Content writes (4)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| POST | `/api/drafts` | yes | 自动 save-draft |
| PATCH | `/api/drafts/:id` | owner | |
| DELETE | `/api/drafts/:id` | owner | |
| GET | `/api/drafts` | yes | 自己的 |

### Reports (1)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| POST | `/api/reports` | yes | `{targetKind, targetId, reason}`;`targetExists` 字段在响应里 |

### Social graph (8)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| POST | `/api/subreddits/:name/subscribe` | yes | `{action: join\|leave}`;notif 取消订阅不发 |
| POST | `/api/users/:name/follow` | yes | `{action: follow\|unfollow}`;notif dedup |
| POST | `/api/users/:name/block` | yes | toggle |
| POST | `/api/subreddits/:name/block` | yes | toggle |
| GET | `/api/notifications` | yes | `?unread=true` |
| POST | `/api/notifications/:id/read` | owner | |
| POST | `/api/notifications/mark-all-read` | yes | 返回 `{count}` |
| POST | `/api/messages` | yes | 限流;不能自发自收 |

### Mailbox (2)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/messages` | yes | `?box=inbox\|sent` |
| GET | `/api/messages/:id` | owner | |

### Admin (2)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/admin/reports` | admin | `?resolved=true\|false` |
| POST | `/api/admin/reports/:id/resolve` | admin | `{action: dismiss\|remove_content}`;已处理 → 409 |

### Misc (1)

| Method | Path | Auth | 说明 |
|---|---|---|---|
| GET | `/api/health` | no | `{status, db, version}`;M8.1 B5 |

---

## 6. 关键陷阱与最佳实践(踩过的坑,后人别再踩)

### 6.1 `node:sqlite` 的 PRAGMA 必须在连接上设

`PRAGMA journal_mode = WAL` 写在 migration body 里**会抛错**
("cannot change into wal");必须在 `db.mjs` 里设好连接再 open。

```js
// ✅ correct
const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

// ❌ wrong — fails on every fresh DB
// 0001_init.sql 里有 PRAGMA journal_mode = WAL;  →  throws
```

### 6.2 `node:test` 必须用真实 `Readable` 包装请求体

把 `req = { url, method, headers }` 这种 plain object 给 handler,
`readBody(req)` 等 `req.on("data", ...)` 永远不 fire — 整个测试
hang,看到 "Promise resolution is still pending" 提示。

```js
// ✅ correct
import { Readable } from "node:stream";
function mkBodyReq(method, url, body) {
  const text = body == null ? "" : JSON.stringify(body);
  return Object.assign(new Readable({
    read() { this.push(text); this.push(null); }
  }), { method, url, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) } });
}

// ❌ wrong — silent hang
const req = { method, url, headers: {}, body: JSON.stringify(body) };
```

### 6.3 路由匹配必须按"literal-wins"排序

`/api/posts/saved` 和 `/api/posts/:id` 长度一样,但一个 0 占位符
一个 1 占位符。手撸的 Router 必须**每次 handle() 都 sort**,
不能依赖注册顺序。

```js
// ✅ correct — sort per request
const sorted = this.routes.slice().sort((a, b) => a.placeholders - b.placeholders);
for (const r of sorted) { /* try match */ }

// ❌ wrong — saved 被 :id 抢先,id="saved" → 404
for (const r of this.routes) { /* try match */ }
```

### 6.4 限流必须是 handler wrapper,不是 middleware

本仓库 Router 的 per-route handler 签名是 `(req, res, ctx, params)`,
**不是** Express 的 `(req, res, ctx, next)`。

```js
// ✅ correct
router.post("/api/auth/login", rateLimit({ limit: 5, windowMs: 5_000 })(async (req, res, ctx) => { ... }));
// rateLimit 内部:
return (handler) => async (req, res, ctx, params) => {
  if (rateLimited) { res.end(429); return; }
  return handler(req, res, ctx, params);
};

// ❌ wrong — `next` 实际是 `params` 对象,`next()` 立刻 TypeError
return async (req, res, ctx, next) => {
  if (rateLimited) { res.end(429); return; }
  return next();   // TypeError: next is not a function
};
```

### 6.5 UNIQUE 索引后,直接 INSERT 会爆,必须 dedupe

`migrations/0003_notif_dedup.sql` 加了 UNIQUE INDEX 后,
所有直接写 `notifications` 表的代码(pre-`fireNotification`
之前可能存在的)都要先 SELECT,或者捕 `SQLITE_CONSTRAINT_UNIQUE`。

```js
// ✅ correct
const existing = db.prepare(
  "SELECT id FROM notifications WHERE user_id=? AND kind=? AND source_kind=? AND source_id=?"
).get(userId, kind, sourceKind, sourceId);
if (existing) return existing.id;
db.prepare("INSERT INTO notifications ...").run(...);
```

### 6.6 ULID 代替自增 ID

`server/lib/ulid.mjs` 用 `crypto.randomBytes(10)` + 时间戳前缀。
好处:
- 字典序 = 时间序,直接 `ORDER BY id` 不用加 `created_at`
- 客户端可猜到下一个 ID 也没事(不是顺序泄露敏感)
- 跨表共享 ID 不会冲突(`p_xxx` / `c_xxx` / `n_xxx` /
  `r_xxx` / `m_xxx` / `d_xxx` 前缀自描述)

### 6.7 `ctx.ip` 必须给到真实 IP

反向代理后端(`nginx`)如果不传 `X-Forwarded-For`,`req.socket.remoteAddress`
是 `127.0.0.1`,所有用户共用一个限流桶,等于没限流。`server/index.mjs`
目前从 `req.socket.remoteAddress` 取;**生产环境 nginx 必须配
`proxy_set_header X-Real-IP $remote_addr;`**,然后再补一行
`ctx.ip = req.headers["x-real-ip"] || ...`。

### 6.8 迁移不能 rollback,只能 forward-fix

schema 改了不写 down migration;加列、删列、加索引,只能继续
写一个 0004_xxx.sql。SQLite 3.35+ 支持 `ALTER TABLE DROP COLUMN`,
之前的版本要先 `ALTER TABLE RENAME` → `CREATE` → `INSERT INTO ... SELECT` →
`DROP` → `ALTER TABLE RENAME` 这种 5 步。

### 6.9 Scrypt maxmem

`maxmem: 64 * 1024 * 1024`(64MB)一定要设。Node 默认 32MB,
被 scrypt 的 `N * r * 128` 估算超过时会抛 "memory limit exceeded"。
我们的 N=2^14, r=8 → 32MB 边界,保险起见 64MB。

### 6.10 SESSION_SECRET 必须稳定

不设的话 `server/auth.mjs` 用 `sha256("minimax-dev-${pid}-${now}")`,
**每次重启失效**,所有现有 cookie 都签名验证失败 → 401。
`docs/DEPLOY.md` §2 给了 systemd 模板里的设置。

---

## 7. 测试体系(7 个脚本)

| 脚本 | 覆盖面 | 跑法 | 时间 |
|---|---|---|---|
| `scripts/lint.mjs` | 68 个源文件:非空 + 大括号配对 | `node scripts/lint.mjs` | <1s |
| `scripts/test.mjs` | 74 个源文件:JSON 解析 + 文件读取 | `node scripts/test.mjs` | <1s |
| `scripts/api-test.mjs` | `src/js/api.js` 60 个方法对拍(后端起在内存) | `node scripts/api-test.mjs` | ~3s |
| `scripts/walk.mjs` | 起 dev server,扫 import graph,找 404 | `npm run dev` 后另开 `node scripts/walk.mjs` | ~1s |
| `node --test server/test/contract/*.test.mjs` | 124 个契约 case(auth/interactions/content/social/admin/removed-content/audit-fixes) | `npm run contract` | ~10s |
| `scripts/_e2e.mjs` | 12 步端到端(register→post→vote→comment→report→mod) | `npm run e2e` | ~3s |
| `scripts/_bench.mjs` | 6 场景 × 8 并发 × 5s,p50/p95/p99/rps | `npm run bench` | ~30s |

**怎么写新 case:**
- **契约 case** 用 `freshApp()` 拿一个隔离的 DB,`withCtx(router, mkBodyReq(...), { db, cookieHeader, ip })` 调端点。
  见 `server/test/contract/_helpers.mjs`。
- **bench 场景** 改 `scripts/_bench.mjs` 顶部的 `SCENARIOS` 数组。
- **e2e 步骤** 改 `scripts/_e2e.mjs` 的 `assert(...)` 串。

`npm test` 是 CI 门槛(`lint && test && api-test`),bench + e2e 是
诊断。

---

## 8. 部署

### 8.1 本地开发(最快)

```bash
git clone <repo>
cd minimax-reddit-clone
node scripts/migrate.mjs          # 一次性,建表 + 灌种子
node server/index.mjs              # 或 npm start
# → http://localhost:5173
```

### 8.2 systemd + nginx(裸机/VPS)

完整模板在 `docs/DEPLOY.md`:
- systemd unit:User=reddit / ProtectSystem=strict /
  ReadWritePaths=/var/lib/reddit-clone / SESSION_SECRET env
- nginx:`proxy_set_header X-Real-IP $remote_addr;` /
  `client_max_body_size 1m;` / `proxy_read_timeout 30s;`
- 备份:`sqlite3 .backup`(在线,不锁)→ 14 天滚动

### 8.3 Docker

```bash
docker build -t minimax-reddit-clone:3.0.0 .
docker compose up -d
# → http://localhost:5173
```

`Dockerfile` 两阶段:
1. `node:22-alpine AS deps` — 其实没依赖,就是 `COPY .` 完事
2. `node:22-alpine` — 运行时,`USER node`,`HEALTHCHECK CMD curl /api/health`

`docker-compose.yml` 一个 service + 一个 named volume,
`SESSION_SECRET` 通过 `.env` 必填(不填就 `entrypoint` 报错退出)。

### 8.4 横向扩

`docs/DEPLOY.md` §6 给了多进程的边界:
- **多读多写** 简单:`server { listen 80; upstream { server 1, 2, 3; } }`,
  SQLite WAL 允许多 reader + 1 writer。
- **别起多个写者**:`node:sqlite` 的 connection 不是 cross-process 锁,
  第二个 writer 进程会拿到 `SQLITE_BUSY`。要写者横向扩得加 Redis 锁。

---

## 9. 复现指南(从零跑起来,5 分钟)

### 9.1 环境

```bash
node --version    # 必须是 v22.5.0+ (有 node:sqlite)
```

Windows / macOS / Linux 任何一个都行。**不需要 `npm install`**。

### 9.2 一行启动

```bash
git clone https://github.com/peckerpro/minimax-reddit-clone.git
cd minimax-reddit-clone
node scripts/migrate.mjs
node server/index.mjs
# 浏览器打开 http://localhost:5173
```

### 9.3 端口

默认 5173(在 `server/index.mjs:159`)。改:
```bash
PORT=8080 node server/index.mjs
```

### 9.4 数据目录

默认 `./data/reddit.db`。改:
```bash
DB_PATH=/var/lib/reddit-clone/reddit.db node server/index.mjs
```

### 9.5 会话密钥(生产必设)

```bash
export SESSION_SECRET="$(node -e 'console.log(require(\"node:crypto\").randomBytes(32).toString(\"hex\"))')"
node server/index.mjs
```

不设:每次重启会失效,所有 cookie 失效。

### 9.6 验证一切正常

```bash
curl http://localhost:5173/api/health
# → {"status":"ok","db":"up","version":"3.0.0"}

node scripts/api-test.mjs
# → 60 ok, 0 bad

node --test server/test/contract/*.test.mjs
# → 124/124 pass
```

### 9.7 跑 Docker

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
docker compose up --build
```

---

## 10. 已知限制(留给后续版本)

> 下面这些是有意识地**没**做的,不是说做不了,而是 v3.0.0
> 优先级不让。v3.x 后续小版本里可以各自吃掉一个。

| # | 项 | 备注 |
|---|---|---|
| 1 | **Edit / Delete (用户自操作)** | PATCH `/api/comments/:id` / DELETE 在路由表里有占位,handler 还是 stub |
| 2 | **Crosspost / Award** | UI 有入口,后端 handler 还没接;`awards_given` 表已经预留 |
| 3 | **Email 验证 + 找回密码** | 注册时 `email` 是必填且 unique,但没发邮件;没"忘记密码" |
| 4 | **2FA / OAuth** | 完全没有 |
| 5 | **CSRF token** | SameSite=Lax + 同源 cookie 当前够防;真要支持跨域表单得加 |
| 6 | **分页 cursor** | `?limit=` (max 100) + `?after=`;数据量 10k+ 要 keyset pagination |
| 7 | **写者多进程 / Redis** | 单进程 + WAL 够 2k rps;真上量要 Redis 锁 |
| 8 | **WebSocket / 实时通知** | 通知现在要刷新页面才看到 |
| 9 | **全文搜索 (FTS5)** | `node:sqlite` 支持 FTS5 扩展,目前是 `LIKE %q%`,慢 |
| 10 | **图片上传到 S3 / 本地** | kind=image 的 post 接受 `image_url`,前端没真的 upload UI |
| 11 | **跨设备 localStorage 同步** | M8.1 N2 让 saved/hidden 走 server 了,votes/drafts/theme 仍只在 local |
| 12 | **审计日志(谁删了谁)** | `removed_by` 在表里,但 audit trail 没 UI 也没导出 |
| 13 | **国际化 / RTL** | 纯英文,LTR;中俄阿这种 RTL 没测过 |
| 14 | **A11y** | 键盘导航大部分能 work,屏幕阅读器没测 |
| 15 | **Multi-region / Edge** | 单点 SQLite,没 CDN;静态资源目前 `Cache-Control: no-cache` |

---

## 11. 怎么看代码

**最快的 onramp(15 分钟搞清楚全栈):**

1. `package.json` — 看 scripts,知道怎么跑
2. `index.html` — SPA 入口,就 30 行
3. `src/js/main.js` — 30 个 `router.add(...)`,前端 nav 表
4. `server/index.mjs` — 后端入口,看 `register*` 那串就知道有多少域
5. `server/router.mjs` — 40 行的手写 router
6. `server/handlers/posts.mjs` — 一个完整域的样例
7. `migrations/0001_init.sql` — 数据形状
8. `server/test/contract/auth.test.mjs` — 14 个端到端测试,学完就知道 contract 怎么写

**贡献代码:**
1. Fork → 新分支(`feature/<name>` 或 `fix/<name>`)
2. 改完跑 `npm test`(必须绿)
3. 改后端:`npm run contract && npm run e2e`
4. 改前端:`npm run api-test && npm run walk`
5. 改 schema:新增 `migrations/0004_xxx.sql`,**不**改 `0001`
6. 提交用 Conventional Commits(`feat:` / `fix:` / `chore:` / ...)
7. 推分支 + 开 PR,CI 跑 `npm test`

---

## 12. 版本 & 文档导航

- v0.0.0 – v2.1.0 — 纯前端 SPA(无后端,JSON 种子),历史在 `docs/versions/`
- v3.0.0 — **当前**,全栈
- v3.0.1 — 待切(包含 M8.1 审计修复)
- 下一站 — 看 §10 哪个先吃

**相关文档:**
- `docs/DEPLOY.md` — systemd / nginx / 备份
- `docs/M3_BACKEND.md` — M3 后的 API 完整契约(更细于 §5)
- `docs/V3_PLAN.md` — M0..M8 拆分思路
- `docs/analysis/REDDIT_FSM.md` — SPA 的 UI 状态机(v2.x 时代)
- `docs/analysis/STATE_MACHINE.md` — 同上的简表
- `AGENTS.md` — 仓库给 AI agent 看的"项目记忆"

---

**License:** MIT(见 `package.json`)
**Author:** peckerpro
**Repo:** https://github.com/peckerpro/minimax-reddit-clone
