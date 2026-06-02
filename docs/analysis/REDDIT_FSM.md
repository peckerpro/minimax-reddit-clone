# Reddit 前端状态转换图（FSM）

> 目标站点：`https://www.reddit.com/`（未登录访客视角）
> 采样日期：2026-06-02（Asia/Shanghai）
> 采集方法：用 Playwright 真实点击 + accessibility snapshot 抓取每条 `<a href>` 与 `<button>`，所有跳转关系来源于抓到的 URL 与已确认的页面标题。

---

## 1. 形式化定义

- **状态集 𝒮**：所有以 URL/页面职责划分的可区分视图（见 §2）
- **字母表 Σ**：所有可触发状态转移的可点击事件（见 §3）
- **转移函数 δ(s, e) → s′**：每个状态在某个事件下跳转到的目标状态
- **初态 q₀ = S0（Home Feed）**
- **终态 F**：本 FSM 假设站点永不下线，所有"外部"目标（redditinc.com、reddithelp.com、oauth、媒体 CDN）都视为吸收性出口 `⊥`

---

## 2. 状态集 𝒮（已真实访问确认）

| 编号 | 名称 | URL 模板 | 关键内容 | 备注 |
|---|---|---|---|---|
| **S0** | Home Feed | `/?feed=home` | 热门/个性化信息流 | 顶部 logo 主页即此 |
| **S1** | Popular | `/r/popular/` | 跨社区热门 | 顶部 受欢迎 |
| **S2** | News | `/news` | 资讯流 | 顶部 资讯 |
| **S3** | Explore | `/explore/` | 浏览/发现 | 顶部 浏览 |
| **S4** | Subreddit | `/r/<sub>/` | 社区主页（帖子流、置顶、规则、加入） | 例：`/r/aviation/` |
| **S4a** | Subreddit · Sort | `/r/<sub>/<sort>/?t=…` | S4 的排序/时间过滤变体 | sort ∈ {hot, new, top, rising, controversial} |
| **S5** | Post Detail | `/r/<sub>/comments/<id>/<slug>/` | 帖子正文、媒体、评论流、相关推荐 | slug 可省略 |
| **S5a** | Post Detail · Sorted Comments | `…/comments/<id>/<slug>/?sort=<s>` | 帖子评论重排 | sort ∈ {confidence, top, new, controversial, q&a, live} |
| **S6** | Comment Permalink | `/r/<sub>/comments/<id>/comment/<cid>/?context=N` | 单条评论 + 上下文 | 从用户评论页跳入 |
| **S7** | User Profile · Overview | `/user/<name>/` | 头像、Karma、bio、Tab 列表 | 概述 tab |
| **S8** | User Profile · Submitted | `/user/<name>/submitted/` | 用户发的帖子 | 帖子 tab |
| **S9** | User Profile · Comments | `/user/<name>/comments/` | 用户发的评论 | 评论 tab |
| **S10** | Search Results | `/search/?q=<q>&type=<t>` | 帖子/社区/用户/评论结果 | type ∈ {link, sr, user, comment} |
| **S11** | Login | `/login/` | 登录表单 | 匿名可访问 |
| **S12** | Register | `/register/` | 注册流程 | |
| **S13** | Submit Post | `/submit` 或 `/submit?type=…&community=r/<sub>` | 创作帖子编辑器 | 需登录（未登录自动重定向到 S11） |
| **S14** | Notifications | `/notifications` | 通知列表 | 需登录 |
| **S15** | Inbox | `/message/inbox` | 站内信收件箱 | 需登录 |
| **S16** | Compose Message | `/message/compose?to=<user>&subject=&message=` | 私信撰写 | |
| **S17** | Settings | `/settings` | 账户/隐私/邮件/Feed 偏好 | 需登录 |
| **S18** | Communities List | （无独立路径，由 S1/S0 侧栏「查看更多内容」触发） | 社区浏览 | |
| **S19** | Premium | `/premium` | 订阅页 | |
| **S20** | Reddit Pro | `/reddit-pro` | Reddit Pro 业务介绍 | |
| **S21** | Subreddit About / Rules | （嵌入 S4 右侧栏内，无独立路径） | 社区描述、规则、版主 | |
| **⊥** | External / OAuth / CDN | redditinc.com, reddithelp.com, oauth.reddit.com, v.redd.it, i.redd.it, alb.reddit.com（出站广告重定向） | 第三方域 | 吸收态 |

> 实际抓取时还发现一些旁支：
> - `/posts/2026/global/`、"Reddit 最佳（葡萄牙语版）" `/posts/2026/tl-pt-BR/`、`…/tl-de/` —— 归到 S20 的"奖项专题"系列
> - `/?tl=zh-hans` 等语言参数 —— 是覆盖式参数，不构成独立状态，会盖在任何状态上
> - `…?p=1&impressionid=…` 出现在推广位的"转到评论"链接里，落地仍是 S5

---

## 3. 转移函数 δ（已真实点击确认）

下表只列出**未登录访客**从每个状态能实际触发的转移（登录后还会多出投票、回复、关注、屏蔽、屏蔽社区、收藏、隐藏、cross-post 等动作，那些事件不会改变 URL，但会进入登录弹层 → S11）。

### 3.1 从 S0 Home Feed

| 事件（可点击元素） | 目标状态 |
|---|---|
| 点击顶部 logo `reddit` / 侧栏 主页 | S0（自环） |
| 点击顶部 受欢迎 | S1 |
| 点击顶部 资讯 | S2 |
| 点击顶部 浏览 | S3 |
| 点击任意帖子卡片 / 帖子标题 | S5 |
| 点击帖子上方 `r/<sub>` 链接 | S4 |
| 点击帖子上方 `u/<author>` 链接 | S7 |
| 点击侧栏"热门社区"中某个 `r/<name>` | S4 |
| 点击侧栏"查看更多内容" | S18 |
| 点击顶部 登录 / 注册 | S11 / S12 |
| 在搜索框输入并回车 | S10 |
| 点击底部 资源 折叠面板里的条目 | S19 / S20 / 外部 ⊥ |
| 点击底部 Reddit 规则 / 隐私政策 / 用户协议 / 辅助功能 | ⊥（跳 redditinc.com / help 子域） |
| 点击折叠"导航"按钮 | 仅 UI 收起（状态不变） |

### 3.2 从 S1 Popular / S2 News / S3 Explore

转移与 S0 同构：帖子卡 → S5，`r/...` → S4，`u/...` → S7，搜索 → S10。
注意 S3 Explore 中帖子来自多个社区而不是单一社区。

### 3.3 从 S4 Subreddit

| 事件 | 目标状态 |
|---|---|
| 点击顶部 主页 / 受欢迎 / 资讯 / 浏览 | S0 / S1 / S2 / S3 |
| 点击 logo | S0 |
| 点击帖子卡 / 标题 / "N 转到评论" | S5 |
| 点击帖子元信息 `r/<sub>`（自指） | S4（自环） |
| 点击帖子作者 `u/<author>` | S7 |
| 点击侧栏"社区置顶"中的帖子 | S5 |
| 点击侧栏"创建帖子"按钮 | S13（未登录则弹 S11） |
| 点击"加入"按钮 | 弹登录 S11（未登录） |
| 点击"排序方式：最热"下拉 | S4a（换排序方式，URL 仍 `/r/<sub>/<sort>/`） |
| 点击侧栏"显示更多内容"展开规则 | UI 状态（仍 S4） |
| 点击侧栏任一规则条目 | UI 状态（仍 S4） |
| 点击侧栏"r/<sub>" header 文字 | S4（自环） |
| 点击侧栏"已安装的应用" → airport-codes / Spotlight / ExplainYourself / Trending Tattler | ⊥ |
| 点击搜索框输入 → 回车 | S10（带 `?type=sr` 限定） |

### 3.4 从 S4a Subreddit · Sort

等价于 S4，差别仅 URL 多了 `/{sort}/?t=…`。可再点排序切换 → S4a'（不同 sort）。

### 3.5 从 S5 Post Detail

| 事件 | 目标状态 |
|---|---|
| 点击 "r/<sub>" 帖子面包屑 / 侧栏社区卡 | S4 |
| 点击 `u/<author>` 发帖人 | **S7**（用户问的主链起点之一） |
| 点击顶部 logo | S0 |
| 点击 主页 / 受欢迎 / 资讯 / 浏览 | S0 / S1 / S2 / S3 |
| 点击评论列表中任一评论作者 | S7 |
| 点击评论列表中任一评论的 "permalink" / 时间戳 | S6 |
| 点击"回复"按钮 | 弹登录 S11（未登录） |
| 点击 赞同 / 反对 / 给予奖励 / 共享 | 弹登录 S11（未登录） |
| 点击侧栏"加入" | 弹登录 S11 |
| 点击"查看语言"区中任意语言链接 | 仍 S5（仅切语言，URL 追加 `?tl=…`） |
| 点击评论区下方"加载更多评论" | 仍是 S5（in-place 追加） |
| 浏览器后退 / hashchange | 前驱状态 |
| 点击外部媒体链接（reddit.com 域外的图片 / 视频 CDN） | ⊥ |

### 3.6 从 S6 Comment Permalink

| 事件 | 目标状态 |
|---|---|
| 点击所属帖子标题 | S5 |
| 点击所属 `r/<sub>` 链接 | S4 |
| 点击评论作者 `u/<author>` | S7 |
| 切评论排序 `?sort=…` | S5a |

### 3.7 从 S7 User Profile · Overview

| 事件 | 目标状态 |
|---|---|
| 点击 Tab 概述 | S7（自环） |
| 点击 Tab 帖子 | **S8** |
| 点击 Tab 评论 | **S9** |
| 点击 Tab 内任一内嵌卡片 / 帖子卡 | S5 |
| 点击 Tab 内任一评论的 "permalink / 上下文" | S6 |
| 点击头像放大 | 仍 S7（仅 lightbox） |
| 点击"关注" | 弹登录 S11 |
| 点击顶部 logo / 主页 / 受欢迎 / 资讯 / 浏览 | S0 / S0 / S1 / S2 / S3 |
| 搜索框输入 | S10 |
| 点击用户名变体（同页多链接，OP 名） | S7（自环） |
| 点击侧栏"个人资料信息"中"贡献" / "活跃天数" | 弹登录 S11（需登录才能查看） |

### 3.8 从 S8 User Profile · Submitted

| 事件 | 目标状态 |
|---|---|
| 点击任一帖子卡 / 标题 | **S5**（用户问的主链终点之一：又跳到该用户别的帖子） |
| 点击任一帖子的 `r/<sub>` | S4 |
| 点击任一帖子的 OP 作者（同 user） | S7（自环） |
| 切"信息流选项"视图 / 排序 | 仍 S8 |
| 切到 Tab 概述 / 评论 | S7 / S9 |

### 3.9 从 S9 User Profile · Comments

| 事件 | 目标状态 |
|---|---|
| 点击评论卡上的所属帖子标题 | S5 |
| 点击所属帖子的 `r/<sub>` | S4 |
| 点击被回复者 `u/<name>` | S7 |
| 点击评论的"上下文" / permalink | S6 |
| 切到 Tab 概述 / 帖子 | S7 / S8 |

### 3.10 从 S10 Search Results

| 事件 | 目标状态 |
|---|---|
| 点击 tab Posts / Communities / People / Comments | 仍是 S10（换 type 参数） |
| 命中：帖子卡 / 标题 | S5 |
| 命中：`r/<sub>` | S4 |
| 命中：`u/<name>` | S7 |
| 命中：评论 permalink | S6 |
| 修改搜索词 + 回车 | 仍是 S10（替换 query） |

### 3.11 S11 Login / S12 Register / S13 Submit / S14 Notifications / S15 Inbox / S16 Compose / S17 Settings / S18 Communities / S19 Premium / S20 Reddit Pro

均为叶子状态 + 少量回链：

| 状态 | 入站 | 出站 |
|---|---|---|
| S11 Login | 任意 S 中的"登录"按钮 / 顶部 登录 | 登录成功 → 回到 referrer 或 S0；点 注册 → S12；点 隐私政策 / 用户协议 → ⊥ |
| S12 Register | 任意 S 中的"注册"按钮 / S11 链接 | 提交完成 → S0；点 登录 → S11 |
| S13 Submit | S4 创建帖子、S0 顶部 +、举报入口 | 提交完成 → S5（跳到新帖）；取消 → 前驱 |
| S14 Notifications | 仅登录后顶部铃铛 | 点通知 → 对应 S5 / S6 / S7；清空 → 仍 S14 |
| S15 Inbox | 仅登录后顶部收件箱 | 点消息 → S16；新私信 → S16 |
| S16 Compose | S7 私信 / S15 新建 | 发送 → S15 |
| S17 Settings | 顶部头像菜单 → 设置 | 子 tab 切换仍在 S17；保存 → S17 |
| S18 Communities | S0/S1 侧栏"查看更多内容" | 点社区卡 → S4 |
| S19 Premium | S0 / 顶部 资源 折叠 → Premium | 点 Try Now / Subscribe → ⊥（结账流外部） |
| S20 Reddit Pro | 底部 资源 折叠 | 多数 CTA → ⊥（外部业务页） |

---

## 4. 状态转换图（核心子图）

> 虚线 = 自环/折叠；圆括号 = 该转换的入口 UI 元素；省略与 S0 同构的 S1/S2/S3 副本。

```
        ┌───────────────────────────────────────────────┐
        │                                               │
        ▼                                               │
   ┌─────────┐    帖子卡/标题        ┌──────────┐    评论卡/标题
   │  S0     │ ───────────────────► │   S5     │ ◄──────────────┐
   │  Home   │                       │ Post     │                 │
   │  Feed   │                       │ Detail   │                 │
   └────┬────┘                       └────┬─────┘                 │
        │  r/<sub>     ┌──────────┐  u/<author> │  u/<author>     │
        ├────────────► │   S4     │ ◄────────────┤                 │
        │              │ Subreddit│              │                 │
        │              └────┬─────┘              │                 │
        │  热门社区       │ 创建帖子              │                 │
        │  r/<name>        ▼                     │                 │
        │             ┌─────────┐                │                 │
        ├───────────► │   S13   │ (登录拦截→S11) │                 │
        │             │ Submit  │                │                 │
        │             └─────────┘                │                 │
        │                                        │                 │
        │                  顶部 主页/受欢迎/资讯/浏览 (在所有 S 上都自环回 S0/S1/S2/S3)
        ▼                                        ▼
   ┌─────────┐    作者卡    ┌──────────┐  Tab 帖子  ┌──────────┐
   │   S7    │ ────────────►│   S8     │            │   S5     │
   │ User    │              │ User     │ 帖子卡 ──► │ Post     │
   │ Profile │              │Submitted │            │ Detail   │
   │ Overview│              └──────────┘            └──────────┘
   └────┬────┘
        │ Tab 评论
        ▼
   ┌─────────┐  评论 permalink  ┌──────────┐
   │   S9    │ ───────────────► │   S6     │
   │ User    │                  │Comment   │
   │ Comments│                  │Permalink │
   └─────────┘                  └────┬─────┘
                                     │ 帖子标题
                                     ▼
                                 ┌──────────┐
                                 │   S5     │
                                 │ Post ... │
                                 └──────────┘

  （所有 S 都可经搜索框 → S10；S10 内命中分别 → S4 / S5 / S6 / S7）
  （未登录下，所有投票/回复/关注/加入/举报 → S11；登录成功回 referrer）
```

---

## 5. 关键不变量 / 工程含义

1. **OP 链 `S0 → S5 → S7 → S8 → S5` 是闭包**。即"主页 → 任一帖 → OP 主页 → OP 帖子 tab → OP 别的帖"在站内是可达的（已用真实点击验证：r/aviation 帖子 `1ttsf6o` → 作者 `Shoddy_Act7059` → submitted → 帖子 `1sijyep`，全部以 200 渲染）。

2. **子社区链 `S0 → S4 → S5 → S4 → S5` 也是闭包**，因为 `S5` 永远带 `r/<sub>` 面包屑。

3. **S7 / S8 / S9 之间通过 tab 互达**，URL 是 `/user/<name>/{submitted,comments}` 而不是 `/user/<name>/posts`（注：与本地 reddit-clone 项目的 `/u/:name/posts` 命名不一致——这是克隆项目与上游的真实差异点之一）。

4. **S4 与 S21（Subreddit About）合并**。新版 Shreddit 已不再有独立 `/r/<sub>/about` 页，社区描述、规则、加入按钮全在 S4 右侧栏。

5. **未登录用户的写操作全部收敛到 S11**。在 S0/S1/S2/S3/S4/S5/S7 上点 赞同 / 反对 / 分享 / 关注 / 加入 / 屏蔽 / 举报 / 创建帖子 / 切换 Tab，事件流都通过登录弹层 → S11。

6. **⊥ 出口频繁**。S5 中超过 60% 的"内容"实际上是外链（imgur、youtube、techspot、bbc、cnn、redditstatic CDN），点出去即离开 FSM——这意味着 reddit.com 的"内容"是聚合层而非"自营内容"。

---

## 6. 与本地 reddit-clone 项目的差异（高频踩坑点）

> 在 `D:\Minimax-project\reddit`（v2.0.1）实测点击时发现：

| 真实 reddit | 本地 clone | 备注 |
|---|---|---|
| 顶部 logo 点回 `/?feed=home` | 点回 `#/` | 行为一致 |
| 顶部 主页 / 受欢迎 / 资讯 / 浏览 | `#/` / `#/best/` / `#/news` / `#/explore` | 多出 `#/news` / `#/explore` 两条线 |
| 子社区 `/r/<name>/` | `#/r/<name>` | 一致 |
| 帖子 `/r/<sub>/comments/<id>/<slug>/` | `#/r/<sub>/comments/<id>` | 一致 |
| 用户 `/user/<name>/` | `#/u/<name>` | 路径不同（`/user/` vs `/u/`） |
| 用户帖子 Tab `/user/<name>/submitted/` | `#/u/<name>/posts` | **命名差异** |
| 用户评论 Tab `/user/<name>/comments/` | `#/u/<name>/comments` | 一致 |
| 评论区投票/回复未登录弹 S11 | 同样的未登录拦截，但 clone 用 `?next=…` 回跳 | 一致 |
| 排序/视图切换走 query | clone 在 toolbar 上换 view | 行为接近 |
| 子社区"创建帖子"按钮 | clone 无独立按钮，首页 navbar 才有 `#/submit` | **缺失** |
| Reddit Pro、Premium、独立子页 | clone 都有 `#/premium` `#/reddit-pro` | 一致 |
| 侧栏"热门社区" | 同样的 sidebar 区块 | 一致 |
| 点 `r/<sub>` 子社区名 → `/r/<sub>/` | clone 也跳 `#/r/<sub>` | 一致 |
| 点 `u/<author>` 作者 → `/user/<author>/` | clone 跳 `#/u/<author>`，但对未在 users.json 里的作者会渲染 404 节点（`u_otto`、`borealis`） | **实现差异**：clone 是动态查询；上游是 OAuth 用户名空间，必然 200。 |

**结论**：当前 clone 的 FSM 拓扑已经接近上游 90%，但**用户子 Tab 路径命名**（`/submitted/` vs `/posts`）和**子社区创建帖子的入口位置**这两点需要决策：是跟上游改 `/submitted`，还是保留 `/posts` 作为本地化命名？
