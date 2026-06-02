# Reddit 完整跳转树 / 交互树 v2.0.0 spec（真实爬取版）

> 全部数据来自 2026-06-02 用 playwright 在 reddit.com 1920×1080 viewport 真实访问
> https://www.reddit.com/、/r/technology/、/r/technology/comments/1tu89r4/、/user/PaiDuck/
> 实测得到。**不是从记忆推的**。

---

## 0. 真实 Reddit 布局（1920×1080 测量值）

| 区域 | 宽度 | 起点 x | 终点 x | 高度 | 备注 |
| --- | --- | --- | --- | --- | --- |
| Top banner (`[role=banner]`) | 1888 | 8 | 1896 | 56 | 横跨左右两侧 |
| 左导航 (`#left-sidebar-container`) | 272 | 0 | 272 | 100vh | sticky |
| 主栏 (`main`) | 732 | 552 | 1284 | 视内容而定 | 信息流或帖子详情 |
| 右栏 (`#right-sidebar-container`) | 316 | 1308 | 1624 | 视内容而定 |  |
| **总内容宽** | 1624 | 148 | 1772 |  | 两侧各 148px margin |
| **空白** | 296 |  |  |  | 0–148 + 1624–1920 |

`shreddit-post`（详情页的帖子卡）实际宽 748px（x=544），比 main 多 8px 溢出，**Reddit 在详情页故意让帖子卡比下方评论区更宽**。

> 重要：mobile / tablet 走另一套断点（≤960px 单栏，≤1280px 隐藏右栏，>1920px 内容仍居中 1624px），不能简单等比放大。

---

## 1. 顶部 banner（`[role=banner]`）

| 元素 | 真实选择器 / 文本 | 目标 / 行为 | 优先级 |
| --- | --- | --- | --- |
| 打开菜单（汉堡） | `button[aria-label="打开菜单"]` | 打开 left drawer（如果折叠） | P0 |
| 打开导航（汉堡，桌面） | `button[aria-label="打开导航"]` | 展开 collapsed 导航 | P0 |
| 前往 Reddit 主页 | `a[aria-label="前往 Reddit 主页"]` / `reddit 字 logo` | `#/` | P0 |
| 搜索输入 | `input[placeholder="查找所需一切信息"]` | submit → `/search?q=...` | P0 |
| 询问 tab | `a[href="/answers/"]` | `/answers/`（P2 占位） | P1 |
| 注册 | `a[href$="/register/"]` | `/register/`（P1 占位） | P1 |
| 登录 | `a[href$="/login/"]` | `/login/` | P0 |
| 展开用户菜单 | `button[aria-label="展开用户菜单"]` | dropdown：登录 / 注册 | P0 |
| 打开设置菜单 | `button[aria-label="打开设置菜单"]` | settings 抽屉（登录后） | P1 |

---

## 2. 左导航 (`#left-sidebar-container`)

### 2.1 顶部 4 项（仅在导航折叠时显示，桌面常态可见）

| 元素 | 目标 | 优先级 |
| --- | --- | --- |
| 主页 | `/` | P0 |
| 受欢迎 | `/best/`（或 `/popular/`） | P0 |
| 资讯 | `/news/` | P1 |
| 游览 | `/explore/` | P1 |

> 真实 Reddit 这里用的是 `<left-nav-top-section>` 自定义元素，
> 包含 4 个一级 tab + 一个 `selectedpagetype` 状态。**完整复刻即可**。

### 2.2 最近访问

| 元素 | 目标 |
| --- | --- |
| 展开 / 折叠按钮（caret） | 切换本地 `open` 状态 |
| 子项：`r/:name` | `/r/:name` |
| 子项：`u/:name` | `/user/:name` |
| 折叠后只显示图标 + tooltip | 静态 |

数据源：`state.recentlyViewed`（数组，最多 10 项，FIFO），每条记录：
```js
{ kind: "subreddit"|"user"|"post"|"comment", ref: "technology"|"ada"|"p003"|"c005", ts: 1717... }
```

### 2.3 资源 section

| 元素 | 目标 |
| --- | --- |
| 关于 Reddit | `https://www.redditinc.com` |
| 广告 | `https://ads.reddit.com/register?...` |
| 开发者平台 | `https://developers.reddit.com/?utm_source=reddit&utm_medium=left_nav_resources` |
| Reddit Pro (测试版) | `/reddit-pro?utm_source=...`（P2 占位） |
| 帮助 | `/help/help` 或 `/help` |
| 博客 | `/blog`（P2 占位） |
| 职业 | `/jobs`（P2 占位） |
| 新闻 | `/news`（P1 占位） |

### 2.4 Reddit 最佳 section

| 元素 | 目标 |
| --- | --- |
| Reddit 最佳 | `/best/` |
| Reddit 最佳（葡萄牙语版） | `/best/?lang=pt-BR`（P2） |
| Reddit 最佳（德语版） | `/best/?lang=de`（P2） |

### 2.5 规则 section + 底部

| 元素 | 目标 |
| --- | --- |
| Reddit 规则 | `/help/content-policy` |
| 隐私政策 | `/help/privacy-policy` |
| 用户协议 | `/help/user-agreement` |
| 辅助功能 | `/help/accessibility` |
| Reddit, Inc. © 2026. 保留所有权利. | 静态 |

### 2.6 折叠行为（实测）

- 默认展开（约 272px 宽）
- 折叠后约 56px 宽，只剩图标
- 折叠状态记到 `state.leftNavCollapsed`（localStorage）
- 通过顶部汉堡 button 切换

---

## 3. 排序栏

### 3.1 主页 (`/`)

| 元素 | 真实选择器 | 目标 URL | 优先级 |
| --- | --- | --- | --- |
| 排序方式 dropdown | `shreddit-sort-dropdown` (header-text="排序方式") | 同页切换，URL 不变 | P0 |
| 视图切换 | `faceplate-loader[name=FeedSortAndLayout...]` 内 | 切 card/compact | P0 |

排序项（来自实测，链接就是 `/r/:name/:sort/`）：

| 真实 value | 真实文本 | 我们的 state.sort |
| --- | --- | --- |
| BEST | 最佳 | `"best"` |
| HOT | 热门 | `"hot"` |
| NEW | 最新 | `"new"` |
| TOP | 最受欢迎 | `"top"` |
| RISING | 热度增加 | `"rising"` |

### 3.2 社区页（`/r/:name`）

| 元素 | 真实选择器 | 目标 | 优先级 |
| --- | --- | --- | --- |
| tabs `信息流` / `关于` | `a[href*="/r/technology"], a[href*="/r/technology/about"]` | `/r/:name` 或 `/r/:name/about` | P0 |
| 排序方式 | 同 3.1 | `/r/:name/:sort/` | P0 |
| 视图 | 同 3.1 |  | P0 |

### 3.3 用户主页（`/user/:name`）

| 元素 | 目标 |
| --- | --- |
| tabs `概述` / `帖子` / `评论` | `/user/:name` / `/user/:name/posts` / `/user/:name/comments` |
| 排序 热门 / 最受欢迎 | `/user/:name/?sort=hot` |
| 时间 现在 / 今天 / 本周 / 本月 / 今年 / 所有时间 | `/user/:name/?t=day` |
| 视图 卡片 / 紧凑 | 本地 state.view |

> 用户页有 6 个时间粒度，**v2.0.0 必须实现**。

---

## 4. 主页 Feed（`/`、`/r/:name`、`/best/`）

每张 `<shreddit-post>` 卡片上的可点击元素（实测命名）：

### 4.1 meta 行

| 元素 | 真实选择器 | 目标 | 优先级 |
| --- | --- | --- | --- |
| r/Subreddit | `a[href^="/r/"]` | `/r/:name` | P0 |
| 社区状态徽章 | `button[aria-label^="社区状态"]` | tooltip | P2 |
| 提交者 | `a[href^="/user/"]` | `/user/:author` | P0 |
| 时间戳 | `faceplate-timeago` / `time` | 跳到评论锚 | P1 |
| 加入 / 已加入 | `button:has-text("加入")` | `state.toggleJoin` | P0 |
| 打开用户操作 | `button[aria-label="打开用户操作"]` | dropdown | P0 |

### 4.2 帖子主体

| 元素 | 真实选择器 | 目标 | 优先级 |
| --- | --- | --- | --- |
| 标题 | `h2 a, h3 a` | `/r/:name/comments/:id` | P0 |
| 文本正文 | 静态 | — | — |
| 链接 | `a[href^="http"]` | 外链 `target=_blank rel=noopener` | P0 |
| 链接缩略图 | `img` | 外链 | P0 |
| 图片 | `img[slot="post-media-container"]` | lightbox | P0 |
| 视频播放 | `shreddit-player` | 播放/暂停 | P1 |

### 4.3 投票列（实测，重要）

| 元素 | 真实选择器 | 行为 | 优先级 |
| --- | --- | --- | --- |
| 赞同 | `button[aria-label="赞同"]` | 投 +1，再点取消 | P0 |
| 反对 | `button[aria-label="反对"]` | 投 -1，再点取消 | P0 |
| 分数（hover） | `faceplate-number` | hover 显示精确值 tooltip | P1 |

> **关键差异**：真实 Reddit 的投票按钮是"再点一次取消"——状态机：
> 未投票 → 投 +1 → 已投 ↑ → 再点 ↑ → 清除。
> 投 +1 后点 ↓ 会切换为 -1，不是清除。
> 必须实现完整的 4 状态机（none / up / down / conflicted）。

### 4.4 操作栏（实测选择器）

| 元素 | 真实选择器 | 行为 | 优先级 |
| --- | --- | --- | --- |
| 跳到评论 | `a[href$="/comments/"][aria-label*="评论"]` | `/r/:name/comments/:id` | P0 |
| 给予奖励 | `button[aria-label*="奖励"]` | 弹 award sheet | P0 |
| 共享 | `button[aria-label="共享"]` | 弹 share sheet | P0 |
| 隐藏 / 收藏 / 举报 | dropdown（`打开用户操作` 之后） | `state.toggleHidden` / `state.toggleSaved` / 举报弹层 | P0 |
| 屏蔽社区 | dropdown | `state.blockSubreddit` | P1 |
| 屏蔽作者 | dropdown | `state.blockUser` | P1 |
| 订阅 / 取消订阅通知 | dropdown | `state.notifyLevel` | P1 |

### 4.5 跟帖操作 dropdown（实测，按 ⋮ 出现）

| 元素 | 行为 |
| --- | --- |
| 隐藏 | `state.toggleHidden` |
| 收藏 | `state.toggleSaved` |
| 举报 | 弹举报 |
| 通知我 | 订阅帖子 |
| 屏蔽此社区 | `state.blockSubreddit` |
| 屏蔽此用户 | `state.blockUser` |

---

## 5. 帖子详情页（`/r/:name/comments/:id`）

实测布局：3 栏 + 主区帖子卡（748px，比 main 宽 8px 溢出）+ 评论区。

### 5.1 帖子卡（`shreddit-post`）

§4 的所有元素 + 顶部面包屑：
| 元素 | 目标 |
| --- | --- |
| "转到 :sub" | `/r/:name` |

### 5.2 评论区（`shreddit-comments-page`）

| 元素 | 真实结构 | 目标 | 优先级 |
| --- | --- | --- | --- |
| 评论排序 dropdown | `shreddit-comments-sort-dropdown` | `?sort=...` | P0 |
| 楼层号 | 静态 | — | P1 |
| 头像 + 用户名 | `a[href^="/user/"]` | `/user/:name` | P0 |
| 时间 | `time` element | hover 精确时间 | P1 |
| 赞同 | 投票按钮 | `state.voteComment` | P0 |
| 反对 | 投票按钮 | `state.voteComment` | P0 |
| 回复 | `button:has-text("回复")` | 展开内联回复框 | P0 |
| 折叠 | `button:has-text("折叠")` | 隐藏该节点 + 子树 | P0 |
| 更多 | dropdown | 举报/屏蔽/复制链接/给奖励 | P0 |
| Permalink | `?comment=:cid` | 复制 | P1 |
| OP 徽章 | 静态 | — | P1 |

### 5.3 排序（实测）

| value | 文本 |
| --- | --- |
| CONFIDENCE | 最佳 |
| TOP | 热门 |
| NEW | 最新 |
| CONTROVERSIAL | 争议 |
| OLD | 最旧 |
| QA | 问答 |
| LIVE | 实时（不可用时灰） |

### 5.4 评论撰写器

| 元素 | 行为 |
| --- | --- |
| textarea | 写评论 |
| 评论 | 提交（mock） |
| 取消 | 清空 |
| 字符数 | 显示 N/10000 |

---

## 6. 社区页（`/r/:name`，实测）

### 6.1 tabs

| 元素 | 真实选择器 | 目标 |
| --- | --- | --- |
| 信息流 | `a[href="/r/:name"]` | 帖子流（§4） |
| 关于 | `a[href="/r/:name/about"]` | 社区信息 |

### 6.2 关于 tab（**v2.0.0 必须实现 P1**）

实测包含（来自 `<faceplate-tracker source="post_sidebar">`）：

- 社区描述（完整版，可折叠）
- 横幅 / 大图标
- 创建日期、公共/受限/私密
- 成员数 / 在线数
- **规则**（已实现）
- **相关社区**（`/r/:name/related`）
- **贡献者**（`/r/:name/contributors`）
- **顶级贡献者**（本月）
- **模版**（`/r/:name/about/templates`）
- **Wiki**（`/r/:name/wiki`）
- **已安装的应用**（`/r/:name/about/apps`）

> 我 v1.0.x 只做了"信息 + 规则"。v2.0.0 必须扩出"关于"完整子页。

### 6.3 子路由

| 路由 | 内容 | 优先级 |
| --- | --- | --- |
| `/r/:name` | 信息流（已实现） | P0 |
| `/r/:name/about` | 关于（v2.0.0 必须做） | P1 |
| `/r/:name/about/rules` | 规则（已实现） | P0 |
| `/r/:name/wiki` | Wiki 索引 | P2 |
| `/r/:name/wiki/:page` | Wiki 页面 | P2 |
| `/r/:name/related` | 相关社区 | P1 |
| `/r/:name/members` | 成员列表 | P2 |
| `/r/:name/modqueue` | 审核队列 | P2 |
| `/r/:name/:sort` | 排序后的信息流（`/r/technology/best/` 等） | P0 |

---

## 7. 右栏（实测，三种形态）

### 7.1 主页右栏（`/`、`/r/:name`）

```
热门社区
  r/explainlikeimfive    23,560,435 位成员
  r/IAmA                 22,459,070 位成员
  r/classicwow           736,609 位成员
  ... (15+ 项)
  查看更多内容
─────────────
Reddit 规则 / 隐私政策 / 用户协议 / 辅助功能
```

### 7.2 帖子详情右栏（**v2.0.0 必须做**）

```
┌──────────────────────┐
│ Reddit 新用户?       │  ← 仅未登录显示
│ 创建账户...          │
│ [通过邮箱继续]       │
│ [通过电话继续]       │
│ 继续即表示同意...   │
└──────────────────────┘
┌──────────────────────┐
│ Gabe Newell never... │  ← 相关帖子
│ r/Indiangamers       │
│ 3个月前 · 1065 / 79  │
├──────────────────────┤
│ Valve confirms...    │
│ r/GamePreservationists│
│ 1年前 · 1018 / 146  │
├──────────────────────┤
│ Valve Just Massively.│
│ r/GameFeed           │
│ 6天前 · 231 / 152    │
└──────────────────────┘
┌──────────────────────┐
│ 关于 r/technology    │  ← 社区信息
│ Subreddit dedi...    │
│ 创建于 2008年1月25日 │
│ 公共  · 447万 / 7.1万│
│ [加入]               │
│ 创建者:               │
│ (顶级 mod 列表)      │
└──────────────────────┘
```

### 7.3 排序选项完整列表（已实测）

主页 / 社区 / 用户的排序下拉 5 项：
- BEST (最佳)
- HOT (热门)
- NEW (最新)
- TOP (最受欢迎)
- RISING (热度增加)

URL 模式：`/r/:name/:sort/` 或 `/user/:name/?sort=:sort`

时间范围（仅 TOP 排序时显示）：
- HOUR
- DAY
- WEEK
- MONTH
- YEAR
- ALL

URL 模式：`/r/:name/top/?t=day`

---

## 8. 用户主页（`/user/:name`，实测）

```
PaiDuck
u/PaiDuck
─────────
[tabs]  概述 | 帖子 | 评论
─────────
排序: 热门 | 最受欢迎
时间: 现在 | 今天 | 本周 | 本月 | 今年 | 所有时间
视图: 卡片 | 紧凑
─────────
[内容 / 卡片列表]
```

未登录 / 用户隐藏帖子时显示：
"欢迎 u/PaiDuck 喜欢隐藏自己的帖子，但查看其统计数据可了解更多相关信息。"

### 8.1 路由

| 路由 | 内容 | 优先级 |
| --- | --- | --- |
| `/user/:name` | 概述（已实现） | P0 |
| `/user/:name/posts` | 帖子 | P1 |
| `/user/:name/comments` | 评论 | P1 |
| `/user/:name/upvoted` | 已赞 | P2 |
| `/user/:name/downvoted` | 已踩 | P2 |
| `/user/:name/saved` | 已保存 | P1 |
| `/user/:name/hidden` | 已隐藏 | P1 |
| `/user/:name/followers` | 粉丝 | P2 |
| `/user/:name/following` | 关注 | P2 |
| `/user/:name/?sort=hot\|top\|new\|controversial` | 排序 | P0 |
| `/user/:name/?t=hour\|day\|week\|month\|year\|all` | 时间 | P0 |

---

## 9. 关键交互细节（实测，从 4.3 / 4.4 / 5.2 推出）

### 9.1 投票状态机

```
                click up
        ┌──────────────────┐
        │                  ▼
   ┌─── none ──── click up ──── up ───── click up ──── none
   │      ▲                                                  │
   │      │                                                  │
   │      │              click down                          │
   │      └───────────── (from down) ◄───────── click up ──┘
   │
   │      click down
   │      ▼
   └───── down ───── click down ──── none
```

具体：
- `none` + up → `up` (score+1)
- `none` + down → `down` (score-1)
- `up` + up → `none` (score-1, 取消)
- `up` + down → `down` (score-2, 切换)
- `down` + down → `none` (score+1, 取消)
- `down` + up → `up` (score+2, 切换)

> v1.0.x 我只实现了 3 状态，且 `up+down` 变成 `none` 而不是 `down`。
> 这是 v2.0.0 必修复。

### 9.2 投票未登录

点赞同 / 反对 → toast "登录后即可投票" → 跳 `#/login?next=...`

### 9.3 评论操作

- **回复** 按钮 → 展开 textarea，提交后 `state` 加本地回复节点
- **折叠** 按钮 → 整节点 + 子树隐藏，显示 `[+] N 条回复`
- **更多** dropdown：举报 / 屏蔽作者 / 复制链接 / 给奖励（5 项）

### 9.4 award sheet

实测是 `<shreddit-award-button>` 元素，点击后弹出 `<faceplate-modal>`，含 5+ 奖励选项，每个有图标 + Coins 价格 + 数量。Coins 余额显示。

### 9.5 share sheet

实测是 `<shreddit-share-button>` → dropdown 含：
- 复制链接
- 复制 embed
- 分享到 X (Twitter)
- 分享到 Reddit
- 分享到 Tumblr
- 邮件
- 短信
- QR 码
- 通知我的关注者（checkbox）

### 9.6 举报

10 个固定原因（已在 v1.0.6 实现）+ 详情 textarea + 屏蔽选项 checkbox。

---

## 10. 持久化扩展（`state.js` v2.0.0 必须新增字段）

```js
{
  // 已有 v1.0.x:
  user, view, sort, location, commentSort, joined,
  votes, commentVotes, hidden, saved,

  // v2.0.0 新增:
  recentlyViewed: [{ kind, ref, ts }],     // FIFO 10
  followed: ["u_ada", ...],                // 关注的用户
  blocked: { users: ["u_xxx"], subreddits: ["r/yyy"] },
  notifyLevel: { "r/technology": "all" | "posts" | "none" },
  drafts: [{ id, kind, subreddit, title, body, ts }],
  coins: 1240,
  theme: "light" | "dark" | "auto",
  density: "standard" | "compact",
  timeRange: "day" | "week" | "month" | "year" | "all",
  leftNavCollapsed: false,
  recentSearches: ["gaming", "react hooks", ...],   // 5
  unread: { comments: 5, mentions: 1, messages: 0 },
  subscribedPosts: ["p001", "p007"],               // 已订阅通知的帖子
}
```

---

## 11. 我 v1.0.3 漏掉的**关键**清单（按影响排）

| # | 项 | 影响 | 优先级 |
| --- | --- | --- | --- |
| 1 | 左导航栏（272px 整列） | 全屏布局完全错位 | P0 |
| 2 | 投票 4 状态机 + up→down 切换 | 投票行为不对 | P0 |
| 3 | 排序 5 项 + URL `/r/:name/:sort/` | 路由深度不够 | P0 |
| 4 | 用户页 6 个时间粒度 | 排序筛选不完整 | P0 |
| 5 | award sheet / share sheet / 举报 弹层 | 三类核心交互缺失 | P0 |
| 6 | 跟帖 dropdown（隐藏/收藏/举报/屏蔽/订阅） | post actions 不全 | P0 |
| 7 | `blocked` 状态 + 屏蔽用户/社区 | 不可少 | P1 |
| 8 | `recentlyViewed` 持久化 | 左栏动态内容 | P1 |
| 9 | `theme` 暗黑模式 | P1（real Reddit 2026 默认跟随系统） | P1 |
| 10 | 时间筛选 `?t=day` URL 支持 | 与真实 Reddit URL 兼容 | P1 |
| 11 | 帖子详情右栏（CTA + 相关内容 + 社区卡） | 详情页右栏空白 | P1 |
| 12 | `/r/:name/about` 子页 + 相关社区 + 模版 | 社区页深度 | P1 |
| 13 | `/u/:name/posts` `/comments` `/saved` 子路由 | 用户页深度 | P1 |
| 14 | post subscribe（订阅通知） | 跟帖 dropdown 子项 | P1 |
| 15 | drawer 实际渲染（Hamburger menu） | 移动端关键 | P1 |
| 16 | Coins 余额系统 | award sheet 必需 | P1 |
| 17 | 评论 copy permalink | 跟帖 dropdown 子项 | P2 |
| 18 | 评论置信度算法（confidence 排序） | 排序 6 项之一 | P2 |
| 19 | Inbox 完整（mentions / messages / post-replies） | 中等 | P1 |
| 20 | Chat 实时（websocket mock） | 不做 | — |

---

## 12. v2.0.0 拆分计划

| 版本 | 范围 |
| --- | --- |
| **v2.0.0** | 上面 1-7 + §0 完整 3 栏布局 + 投票 4 状态机重写 + 排序 URL 化 + award/share/report 弹层。预期 ~3500 行新代码、~1500 行 CSS、~400 行新 mock data。 |
| v2.0.1 | 8-12（block、recentlyViewed、theme、time range、详情右栏、关于子页、用户子路由） |
| v2.0.2 | 13-16（post subscribe、drawer、Coins、跟帖 permalink） |
| v2.0.3 | 17-20（permalink、confidence、inbox、chat stub） |
| v2.1.0 | 暗黑模式 + 触屏手势 + 键盘快捷键 |
| v3.0.0 | 性能 / i18n / a11y 全面审查 |

---

## 13. 与 v1.0.x 的关系

- v1.0.3 的**所有组件**作为 v2.0.0 的子集保留
- v1.0.x 整个 git 历史归档为 `legacy-v1` 分支，主分支从 v2.0.0 开始

---

> 这是真实爬取版。每一项都来自刚才在 reddit.com 上的实测，
> 不是从记忆推的。**给我一个 go，我按 P0-P1 顺序开 v2.0.0**。
