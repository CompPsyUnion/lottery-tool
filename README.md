# lottery-tool

抽奖工具 monorepo，使用 [pnpm workspace](https://pnpm.io/workspaces) 管理前端与后端。

| 目录           | 说明                                  |
| -------------- | ------------------------------------- |
| `apps/web`     | Vue 3 + Vite 单页前端（EdgeOne 部署） |
| `apps/service` | Express 后端（TypeORM + PostgreSQL）  |
| `docs/`        | 独立文档（部署指南等）                |

## 技术栈

- **后端**：Node.js + Express + TypeORM 1.1 + PostgreSQL 18（迁移自动生成，启动即应用）
- **前端**：Vue 3 + vue-router + Vite（SPA，`VITE_API_BASE_URL` 配置 API 地址）
- **工程化**：pnpm workspace、ESLint 9（typescript-eslint）+ Prettier、husky 提交钩子、GitHub Actions 构建后端镜像至 GHCR

## 环境

- Node.js >= 20（推荐 22，见 `.nvmrc`）
- pnpm 10.13.1（由 `packageManager` 字段锁定，可用 Corepack）
- Docker（后端与 PostgreSQL 用 compose 起；前端本地开发无需）

```bash
nvm use
corepack enable
pnpm install
```

## 常用命令

```bash
# 开发
pnpm dev              # 前后端并行启动
pnpm dev:web          # 仅前端（Vite）
pnpm dev:service      # 仅后端（tsup watch；需先起 PostgreSQL）

# 构建与运行
pnpm build            # 构建前端
pnpm start:service    # 生产模式启动后端（node dist/app.js）

# 质量检查（提交钩子也会执行）
pnpm lint             # 全 workspace ESLint 检查
pnpm lint:fix         # ESLint --fix + Prettier 全量格式化
pnpm format           # 仅 Prettier 格式化
pnpm format:check     # CI 用格式检查
pnpm test             # 后端测试（无需数据库的单元测试）
```

也可以进入子目录后使用各包脚本，例如 `pnpm --filter @lottery-tool/web dev`。

## 后端本地开发

```bash
cd apps/service
docker compose up -d postgres   # 起 PostgreSQL 18（数据持久化在 pgdata 卷）
pnpm dev                        # 启动后端（启动时自动应用数据库迁移）
```

数据库 schema 由 `src/entities/` 实体定义，改动后自动生成迁移（详见
[apps/service/README.md](apps/service/README.md) 的迁移工作流章节）。

首次使用：服务启动后通过 `/auth/register` 注册——**首位注册用户自动成为超级管理员**；
之后公开注册默认开启（超管可关闭），需通过邮箱验证码（邮件通道在超管设置页配置，
email-poster POST webhook 形式，无 SMTP）。

## 核心概念

- **活动状态机**：`draft → ready → active → ended`。`ready` 到达开始时间自动开始
  （60 秒定时任务，未设开始时间则立即），到结束时间自动结束；流转受矩阵约束
  （`ended` 终态、`ready` 可撤回），可在活动详情页或编辑页操作
- **抽奖页面测试**：每个活动一个幂等测试码（活动列表/详情的 ▶ 入口），抽奖走完整流程
  （含签字）但不扣库存、不产生真实记录，且无视活动状态与起止时间
- **签字确认**：线下抽奖可选开启（活动设置）；中奖后结果页手动进入必签签字板，
  未签记录可在活动详情的记录页补签

## 提交规范

husky 钩子在提交时自动执行（可绕过，见钩子文件内说明）：

- **pre-commit**：对 staged 文件做 Prettier / ESLint **检查**（不自动修复，
  不合规阻断提交；先 `pnpm lint:fix` 修好再提交）
- **commit-msg**：提交信息须符合 Conventional Commits（`feat:` / `fix:` / `docs:`
  等），且实体改动必须伴随已注册的新数据库迁移（提交信息含
  `bypass migration check` 可跳过迁移检查）

## 参与贡献

贡献流程（Fork → 从 main 新建分支 → PR 合并回 main）见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 部署

- **后端**：push 到 `main` 自动构建镜像推 GHCR（`ghcr.io/comppsyunion/lottery-tool-service`），
  Docker Compose 一键部署见 [docs/DEPLOY_BACKEND.md](docs/DEPLOY_BACKEND.md)
- **前端**：腾讯云 EdgeOne Pages（`edgeone.json` 已含 SPA 路由回退），
  见 [docs/DEPLOY_EDGEONE.md](docs/DEPLOY_EDGEONE.md)
