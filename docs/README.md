# 文档索引

> 仓库里跟"理解项目 / 跑起来 / 改代码"有关的所有文档。

## 新手入口

1. [`README.md`](../README.md) — 5 分钟跑起来
2. [`V3_FULLSTACK_GUIDE.md`](./V3_FULLSTACK_GUIDE.md) — **从零开始的全栈实现**(本仓库的主文档)
3. [`DEPLOY.md`](./DEPLOY.md) — 生产部署(systemd + nginx + TLS + 备份)

## 设计 & 架构

- [`V3_PLAN.md`](./V3_PLAN.md) — v3.0.0 的 M0..M8 拆分思路
- [`M3_BACKEND.md`](./M3_BACKEND.md) — M3 后的 API 完整契约
- [`analysis/REDDIT_FSM.md`](./analysis/REDDIT_FSM.md) — SPA UI 状态机(v2.x 时代)
- [`analysis/STATE_MACHINE.md`](./analysis/STATE_MACHINE.md) — 同上,简表版
- [`analysis/NAVIGATION_TREE.md`](./analysis/NAVIGATION_TREE.md) — Reddit 真实爬取的导航树

## 版本变更

- [`CHANGELOG.md`](../CHANGELOG.md) — 总目录
- [`versions/`](./versions/) — 每个 tag 的 changelog(v0.0.0 → v3.0.0)

## 给 AI agent

- [`AGENTS.md`](../AGENTS.md) — 仓库的项目记忆
- [`.harness/reins/`](../.harness/reins/) — 6 个 agent 配置
