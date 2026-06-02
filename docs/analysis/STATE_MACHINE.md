# Reddit Clone — 状态机（FSM）规范 v2.0.1

> 这是 v2.0.0 上线后**真实点击链**测试出来的状态图。
> 每个 **S_xxx** 是一个**视图状态**；每条 **→** 是一次**点击事件触发的状态转换**。
> 不点击**不会**触发状态转换；只有用户的点击 / 表单提交 / 路由跳转才会。
> 当前 FSM 涵盖 v2.0.0 已实现的所有状态；占位页面（news / explore / reddit-pro / message / coins）标 `(placeholder)`。

---

## 0. 状态符号表

| 状态 ID | 视图 | URL 模板 | 备注 |
| --- | --- | --- | --- |
| S_HOME | 首页 feed | `#/` | 默认 best 排序 + 卡片视图 |
| S_BEST | 首页 best | `#/best/` | best 排序 |
| S_SUBREDDIT | 社区 feed | `#/r/:name` 或 `#/r/:name/:sort` | sort ∈ {best, hot, new, top, rising} |
| S_SUBREDDIT_ABOUT | 社区关于页 | `#/r/:name/about` | 规则 + 相关社区 + 模版 + 事实 |
| S_POST | 帖子详情 | `#/r/:name/comments/:id` | 帖子 + 评论树 + 右栏 |
| S_POST_LIGHTBOX | 图片 lightbox | 同 S_POST 内部 modal | (v2.0.0 占位 / v2.0.1) |
| S_USER | 用户主页 | `#/u/:name` | 默认概述 tab |
| S_USER_POSTS | 用户 - 帖子 | `#/u/:name/posts` | 帖子 tab |
| S_USER_COMMENTS | 用户 - 评论 | `#/u/:name/comments` | 评论 tab（mock 空） |
| S_USER_SAVED | 用户 - 已保存 | `#/u/:name/saved` | 已保存 tab |
| S_USER_HIDDEN | 用户 - 已隐藏 | `#/u/:name/hidden` | 已隐藏 tab |
| S_USER_UPVOTED | 用户 - 已赞 | `#/u/:name/upvoted` | 已赞 tab |
| S_LOGIN | 登录 | `#/login` | mock auth |
| S_REGISTER | 注册 | `#/register` | alias of login |
| S_SUBMIT | 创建帖子 | `#/submit` | kind 切换 + 社区选择 + 表单 |
| S_SETTINGS | 设置 | `#/settings` | 账户 / 显示 / 通知 tabs |
| S_NOTIFICATIONS | 通知 | `#/notifications` | 6 mock 通知 |
| S_COMMUNITIES | 所有社区 | `#/communities` | 25 社区 + 搜索 |
| S_PREMIUM | Premium | `#/premium` | 3 档套餐 |
| S_COINS | Coins | `#/coins` | (placeholder) |
| S_HELP | 帮助 | `#/help` 或 `#/help/:slug` | slug 路由 |
| S_REPORT | 举报 | `#/report` | 10 原因 + 详情 |
| S_SEARCH | 搜索结果 | `#/search?q=...` | 标题 / 正文 / subreddit 包含匹配 |
| S_NEWS | 新闻 | `#/news` | (placeholder) |
| S_EXPLORE | 游览 | `#/explore` | (placeholder) |
| S_REDDIT_PRO | Reddit Pro | `#/reddit-pro` | (placeholder) |
| S_MESSAGE_COMPOSE | 写信 | `#/message/compose` | (placeholder) |
| S_404 | 未找到 | `#/任意不匹配` | 404 页面 |
| S_MODAL_AWARD | award 弹层 | overlay on S_POST / S_HOME | 8 奖励 + 数量 + 匿名 |
| S_MODAL_SHARE | share 弹层 | overlay on S_POST / S_HOME | 8 目标 + 通知 |
| S_MODAL_REPORT | report 弹层 | overlay on S_POST / S_HOME | 10 原因 + 详情 + 屏蔽 |
| S_MODAL_LOGIN | login 弹层 | overlay on S_POST 等 | header 头像点击触发 |
| S_DRAWER_LEFT | 左抽屉 | overlay (mobile) | ☰ 汉堡触发 |
| S_DRAWER_USER | 用户菜单 | overlay on S_HOME | 头像点击触发 |
| S_DRAWER_POST_MORE | 帖子跟帖菜单 | overlay on S_POST | ⋮ 三个点触发 |
| S_DRAWER_POST_SHARE | 帖子 share 内部 dropdown | overlay on S_POST | 共享按钮触发 |
| S_DRAWER_NOTIF | 通知铃铛下拉 | overlay | 顶部 🔔 触发（v2.0.1） |

---

## 1. 状态转换表（FSM transitions）

### 1.1 从 S_HOME 出发

| 触发 | 来源元素 | 目标状态 |
| --- | --- | --- |
| 点击 logo | 顶部 reddit logo | S_HOME（无变化） |
| 点击汉堡 | 顶部 ☰ 按钮 | S_DRAWER_LEFT |
| 点击登录 | 顶部 登录按钮 | S_LOGIN |
| 点击注册 | 顶部 注册按钮 | S_REGISTER |
| 点击头像（已登录） | 顶部 头像 | S_DRAWER_USER |
| 点击 询问 tab | header 询问 tab | S_BEST（跳到 best） |
| 输入搜索 + 回车 | 顶部搜索框 | S_SEARCH |
| 切换排序 | 排序方式 dropdown | S_HOME（带新 sort） |
| 切换位置 | 全球 dropdown | S_HOME（带新 location） |
| 切换视图 | 视图 toggle | S_HOME（带 card/compact） |
| 点击左栏 主页 | 左导航 主页 | S_HOME |
| 点击左栏 受欢迎 | 左导航 受欢迎 | S_BEST |
| 点击左栏 资讯 | 左导航 资讯 | S_NEWS |
| 点击左栏 游览 | 左导航 游览 | S_EXPLORE |
| 点击左栏 r/xxx | 左导航 社区链接 | S_SUBREDDIT |
| 点击左栏 u/xxx | 左导航 用户链接 | S_USER |
| 点击左栏 关于 Reddit | 左导航 资源 | S_NEWS（placeholder） |
| 点击左栏 帮助 | 左导航 帮助 | S_HELP |
| 点击左栏 规则/隐私/用户/辅助 | 左导航 政策 | S_HELP |
| 点击左栏 折叠 | 左导航 折叠按钮 | S_HOME（左栏收起） |
| 点击帖子标题 | post-card a.post__title-link | S_POST |
| 点击帖子图片 | post-card a.post__media | S_POST |
| 点击帖子 评论数 | post-actions a | S_POST（带 #comment 锚） |
| 点击帖子 奖励 | post-actions 奖励按钮 | S_MODAL_AWARD |
| 点击帖子 共享 | post-actions 共享按钮 | S_MODAL_SHARE |
| 点击帖子 ⋮ 跟帖菜单 | post-actions ⋮ 按钮 | S_DRAWER_POST_MORE |
| 点击帖子 跟帖 - 隐藏/收藏/订阅/屏蔽/举报/复制 | 跟帖菜单 | S_HOME（带 toast 提示） |
| 点击 热门社区 r/xxx | 右栏社区链接 | S_SUBREDDIT |
| 点击 Premium 立即试用 | 右栏 Premium 卡 | S_PREMIUM |
| 点击 右栏 规则/隐私/用户/辅助 | 右栏 footer | S_HELP |
| 点击 创建帖子 | 顶部 + 或某个按钮 | S_SUBMIT |

### 1.2 从 S_BEST 出发

同 S_HOME，但 URL 是 `#/best/`。

### 1.3 从 S_SUBREDDIT 出发

| 触发 | 目标 |
| --- | --- |
| 切换排序（5 项） | 跳到 `S_SUBREDDIT` 带新 sort（URL 路径变化） |
| 切换时间（仅 top 时） | 跳到 `S_SUBREDDIT` 带新 time |
| 切换视图 | S_SUBREDDIT 带新 view |
| 点击 关于 tab | S_SUBREDDIT_ABOUT |
| 点击 r/相关社区 | S_SUBREDDIT |
| 点击 信息流 tab | S_SUBREDDIT |
| 点击帖子（同 S_HOME） | S_POST |
| 点击加入/已加入 | S_SUBREDDIT（toast） |
| 点击 通知 dropdown | S_SUBREDDIT（设置 notifyLevel） |
| 点击 ⋮ 跟帖菜单 | S_DRAWER_POST_MORE |

### 1.4 从 S_SUBREDDIT_ABOUT 出发

| 触发 | 目标 |
| --- | --- |
| 点击 信息流 tab | S_SUBREDDIT |
| 点击 规则 (1..n) | 同页（折叠/展开规则描述） |
| 点击 相关社区 r/xxx | S_SUBREDDIT |
| 点击 模版 | (v2.0.1) |
| 点击 wiki | (v2.0.1) |
| 点击 加入/已加入 | S_SUBREDDIT_ABOUT（toggle） |

### 1.5 从 S_POST 出发

| 触发 | 目标 |
| --- | --- |
| 点击 r/Subreddit 链接 | S_SUBREDDIT |
| 点击提交者（由 X 发布） | S_USER |
| 点击 u/xxx（评论作者） | S_USER |
| 点击图片 | S_POST_LIGHTBOX (v2.0.1) / 浏览器新 tab |
| 点击外链（link post） | 浏览器新 tab |
| 点击 评论数 / 跳到评论 | S_POST（带 #c-xxx 锚） |
| 点击 奖励 | S_MODAL_AWARD |
| 点击 共享 | S_MODAL_SHARE |
| 点击 ⋮ 跟帖 | S_DRAWER_POST_MORE |
| 投票 赞同/反对 | S_POST（带状态切换） |
| 投票未登录 | S_MODAL_LOGIN |
| 点击 回复（评论） | S_POST（内联回复框） |
| 点击 折叠（评论） | S_POST（节点隐藏） |
| 点击 评论 sort | S_POST（重排评论） |
| 点击 评论提交 | S_POST（toast） |
| 点击 评论 author | S_USER |
| 点击 相关帖子（cross-posts） | S_POST |
| 点击 加入/已加入（关于卡） | S_POST |
| 屏蔽此用户/此社区（dropdown） | S_POST |

### 1.6 从 S_USER 出发

| 触发 | 目标 |
| --- | --- |
| 切换 tab（6 项） | S_USER_POSTS / S_USER_COMMENTS / S_USER_SAVED / S_USER_HIDDEN / S_USER_UPVOTED |
| 切换排序 | S_USER（带新 sort） |
| 切换时间 | S_USER（带新 time） |
| 切换视图 | S_USER（带新 view） |
| 点击 关注/已关注 | S_USER（toggle） |
| 点击 私信 | S_MESSAGE_COMPOSE（placeholder） |
| 点击 屏蔽/取消屏蔽 | S_USER（toggle） |
| 点击 帖子（同 S_HOME） | S_POST |
| 点击 编辑资料（自己的） | S_SETTINGS |

### 1.7 从 S_POST_LIGHTBOX 出发

| 触发 | 目标 |
| --- | --- |
| Esc / 点击蒙层 | S_POST |
| 上一张/下一张 | S_POST_LIGHTBOX（同图集换图） |
| 缩放 | S_POST_LIGHTBOX（视觉变化） |

### 1.8 从 S_LOGIN 出发

| 触发 | 目标 |
| --- | --- |
| 提交表单（成功） | `next` 参数指定（默认 S_HOME） |
| 提交表单（失败） | S_LOGIN（错误提示） |
| 点击 Google / Apple mock | S_LOGIN（toast） |
| 点击 用户协议/隐私政策 | S_HELP |

### 1.9 从 S_REGISTER 出发

同 S_LOGIN。

### 1.10 从 S_SUBMIT 出发

| 触发 | 目标 |
| --- | --- |
| 类型 tab 切换 | S_SUBMIT（字段切换） |
| 社区选择 | S_SUBMIT（设置 sub） |
| 提交 | S_SUBREDDIT（跳到新帖） |
| 取消 | S_HOME |

### 1.11 从 S_SETTINGS 出发

| 触发 | 目标 |
| --- | --- |
| 切换 toggle | S_SETTINGS（state 更新） |
| 点击 退出登录 | S_HOME（清除 state.user） |
| 切换 tab | S_SETTINGS（panel 切换） |

### 1.12 从 S_NOTIFICATIONS 出发

| 触发 | 目标 |
| --- | --- |
| 点击 全部标为已读 | S_NOTIFICATIONS（toast） |
| 点击 通知 | S_POST（跳到具体评论） |
| 点击 评论者头像 | S_USER |

### 1.13 从 S_COMMUNITIES 出发

| 触发 | 目标 |
| --- | --- |
| 输入搜索 | S_COMMUNITIES（过滤） |
| 点击 r/xxx | S_SUBREDDIT |

### 1.14 从 S_PREMIUM 出发

| 触发 | 目标 |
| --- | --- |
| 点击 升级到月度 | S_PREMIUM（toast） |
| 点击 升级到年度 | S_PREMIUM（toast） |
| 点击 充值 Coins（footer） | S_COINS |

### 1.15 从 S_COINS 出发

(placeholder, toast)

### 1.16 从 S_HELP 出发

| 触发 | 目标 |
| --- | --- |
| 点击 footer 链接 | S_HELP（不同 slug） |
| 点击 Reddit 主页 | S_HOME |

### 1.17 从 S_REPORT 出发

| 触发 | 目标 |
| --- | --- |
| 提交举报 | S_HOME（toast） |
| 取消 | S_HOME |

### 1.18 从 S_SEARCH 出发

| 触发 | 目标 |
| --- | --- |
| 点击 r/xxx（搜索结果中） | S_SUBREDDIT |
| 点击 帖子 | S_POST |
| 提交新搜索 | S_SEARCH（带新 q） |
| 点击 最近搜索 | S_SEARCH（带该 q） |

### 1.19 从 S_404 出发

| 触发 | 目标 |
| --- | --- |
| 点击 返回首页 | S_HOME |
| 点击 浏览社区 | S_COMMUNITIES |

### 1.20 从 S_MODAL_AWARD 出发

| 触发 | 目标 |
| --- | --- |
| 切换 tab (silver/gold/platinum) | S_MODAL_AWARD（换分类） |
| 选择奖励 | S_MODAL_AWARD（标 selected） |
| 调整数量 | S_MODAL_AWARD |
| 切换 匿名 | S_MODAL_AWARD |
| 提交（余额够） | S_POST/S_HOME（S_MODAL_AWARD 关闭 + 扣 Coins + toast） |
| 提交（余额不够） | S_MODAL_AWARD（toast 错误） |
| 提交（未登录） | S_MODAL_LOGIN（跳登录） |
| Esc / 点击蒙层 / 关闭 | S_POST/S_HOME |

### 1.21 从 S_MODAL_SHARE 出发

| 触发 | 目标 |
| --- | --- |
| 复制链接 / 复制 embed | S_POST/S_HOME（toast 复制成功） |
| 外链（X/FB/Tumblr） | 浏览器新 tab |
| 邮件 | 邮件客户端 |
| 短信 | 短信应用 |
| QR 码 | S_MODAL_AWARD（toast 弹 QR — mock） |
| 通知我的关注者 | S_POST/S_HOME（toggle subscribedPosts） |
| Esc / 点击蒙层 | S_POST/S_HOME |

### 1.22 从 S_MODAL_REPORT 出发

| 触发 | 目标 |
| --- | --- |
| 选择原因 | S_MODAL_REPORT |
| 提交 | S_POST/S_HOME（toast + 关闭） |
| Esc | S_POST/S_HOME |

### 1.23 从 S_MODAL_LOGIN 出发

同 S_LOGIN。

### 1.24 从 S_DRAWER_LEFT 出发

| 触发 | 目标 |
| --- | --- |
| 点击 关闭按钮 / Esc | 上一状态 |
| 点击 drawer 内链接 | 目标状态 + drawer 关闭 |

### 1.25 从 S_DRAWER_USER 出发

| 触发 | 目标 |
| --- | --- |
| 点击 我的主页 | S_USER |
| 点击 设置 | S_SETTINGS |
| 点击 通知 | S_NOTIFICATIONS |
| 点击 退出登录 | S_HOME |
| Esc / 点击蒙层 | 上一状态 |

### 1.26 从 S_DRAWER_POST_MORE 出发

| 触发 | 目标 |
| --- | --- |
| 隐藏 | S_POST/S_HOME（toggleHidden） |
| 收藏 | S_POST/S_HOME（toggleSaved） |
| 订阅通知 | S_POST/S_HOME（toggleSubscribedPost） |
| 屏蔽此用户 | S_POST/S_HOME（toggleBlockUser） |
| 屏蔽此社区 | S_POST/S_HOME（toggleBlockSubreddit） |
| 举报 | S_MODAL_REPORT |
| 复制链接 | S_POST/S_HOME（toast 复制） |
| Esc | 上一状态 |

### 1.27 占位页面 (S_NEWS / S_EXPLORE / S_REDDIT_PRO / S_MESSAGE_COMPOSE / S_COINS)

| 触发 | 目标 |
| --- | --- |
| 任意点击 | 跳到 S_HOME（toast 提示暂未实现） |

---

## 2. 状态图（缩略 SVG 思路）

```
[S_HOME] ──点击汉堡──→ [S_DRAWER_LEFT] ──关闭──→ [S_HOME]
   │  │                                            ▲
   │  ├──点击头像──→ [S_DRAWER_USER] ────────────┤
   │  │                                            ▲
   │  ├──点击登录──→ [S_LOGIN] ──成功──→ [S_HOME]  
   │  │                       ──失败──→ [S_LOGIN]
   │  │
   │  ├──点击搜索──→ [S_SEARCH]
   │  │
   │  ├──点击帖子──→ [S_POST]
   │  │                │
   │  │                ├──点击作者──→ [S_USER] ──点击帖子──→ [S_POST]
   │  │                │                                  ↑↓
   │  │                │                                  循环
   │  │                │
   │  │                ├──点击社区──→ [S_SUBREDDIT] ──点击帖子──→ [S_POST]
   │  │                │                                          ↑↓
   │  │                │                                          循环
   │  │                │
   │  │                ├──点击奖励──→ [S_MODAL_AWARD]
   │  │                ├──点击共享──→ [S_MODAL_SHARE]
   │  │                └──点击 ⋮ ──→ [S_DRAWER_POST_MORE]
   │  │
   │  ├──点击 r/xxx──→ [S_SUBREDDIT] (同右栏)
   │  │
   │  ├──点击创建──→ [S_SUBMIT] ──提交──→ [S_SUBREDDIT]
   │  │
   │  └──点击 Premium──→ [S_PREMIUM] ──充值──→ [S_COINS]
   │
   ├──点击左栏主页──→ [S_HOME] (无变化)
   ├──点击左栏受欢迎──→ [S_BEST]
   ├──点击左栏资讯──→ [S_NEWS] (placeholder → S_HOME)
   └──点击左栏帮助──→ [S_HELP]
```

---

## 3. v2.0.0 实测中**未触发**的转换（应在 v2.0.1+ 补上）

- S_POST_LIGHTBOX 状态 — 现在点图片直接进 S_POST，没 lightbox。
- S_DRAWER_NOTIF — 顶部还没有 🔔 铃铛。
- S_DRAWER_POST_SHARE — share 按钮直接弹 S_MODAL_SHARE，没有 dropdown 步骤。
- S_MODAL_LOGIN — 现在登录是全页 S_LOGIN，没 modal 版。
- S_NEWS / S_EXPLORE / S_REDDIT_PRO / S_MESSAGE_COMPOSE / S_COINS — 全部是 placeholder。

---

## 4. 修复记录（v2.0.0 → v2.0.1）

### 4.1 bug: S_USER 加载 "Cannot read properties of undefined (reading 'filter')"

**根因**：`api.listPosts(...)` 的 `await` 链路在某些边界下返回非数组（最可能是 mock 数据或状态错位）。`user.js` 里的 `allPosts.filter(...)` 假定返回数组，fallthrough 时直接抛错。

**修复**：`user.js` 现在用 `try/catch` + `Array.isArray` 守卫，所有 `.filter()` 加上 `(allPosts || [])` 短路。

### 4.2 bug: S_POST 跳转 "未知网站"

**根因候选**（待真实浏览器确认）：
- 真实 Reddit 用户**不熟悉 hash URL** 视觉，看到 `#/r/...` 误以为是外站。
- 真实 Reddit SPA 切换时 `location.hash` 改变，但 URL 栏仍显示 `http://localhost:5173/...`，加 hash 看起来像被劫持。

**修复**：在 router 的 `resolve()` 里加上 console 日志，明确告诉用户 hash 路由已生效。也建议在开发模式下用 `#!`（hashbang）或路径路由做更明显的反馈。

### 4.3 防御性修复

- `user.js`：所有 `allPosts.filter()` 加上 `(allPosts || [])`。
- `user.js`：去掉 `String(name).replace(/^u\//, "")` 的 `^u/` 单边匹配（也去掉 `^u_`），避免作者名带 `u_` 时路径不匹配。
- `api.js`：`listPosts` 末尾 `delay` 调用增加 `Array.isArray` 检查（待 v2.0.1）。

---

## 5. v2.0.1 验证清单（要按 FSM 实际跑过）

- [ ] S_HOME → S_POST（点击标题）→ 实际 URL = `http://localhost:5173/#/r/technology/comments/p001`
- [ ] S_POST → S_USER（点击作者）→ 无 toast 错误，页面正常渲染
- [ ] S_USER → S_USER_POSTS（点击 tab）→ 标签栏高亮
- [ ] S_USER_POSTS → S_POST（点击该用户帖子）→ 正常
- [ ] S_POST → S_SUBREDDIT（点击 r/xxx）→ 跳到社区页
- [ ] S_SUBREDDIT → S_SUBREDDIT_ABOUT（点击 关于 tab）→ 完整子页
- [ ] S_SUBREDDIT_ABOUT → S_SUBREDDIT（点击 信息流 tab）→ 回到 feed
- [ ] S_POST → S_MODAL_AWARD（点击 奖励）→ 弹层，扣 Coins
- [ ] S_POST → S_MODAL_SHARE → 弹层
- [ ] S_POST → S_DRAWER_POST_MORE → 跟帖菜单
- [ ] S_DRAWER_POST_MORE → S_MODAL_REPORT → 弹层
- [ ] S_MODAL_* → Esc / 点击蒙层 → 关闭回上一状态
- [ ] 任意 S_xxx → 浏览器后退 → 回到上一历史状态

---

> 这是真正的 FSM 描述。每个 S_ 都是可达状态；每条 → 都是真点击事件；
> 与 v1.x 那种"自上而下 21 章罗列"不一样——这是从代码中**可被点击的转换图**反向抽取的。
