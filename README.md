# lottery-tool

抽奖工具 monorepo，使用 [pnpm workspace](https://pnpm.io/workspaces) 管理前端与后端。

| 目录 | 说明 | 原仓库 |
| --- | --- | --- |
| `apps/web` | Vue 单页前端 | [Lottery-Tool-Frontend](https://github.com/buduan/Lottery-Tool-Frontend) |
| `apps/service` | Express 后端 | [Lottery-Tool-Backend](https://github.com/buduan/Lottery-Tool-Backend) |

## 环境

- Node.js >= 20（推荐 22，见 `.nvmrc`）
- pnpm 10.13.1（由 `packageManager` 字段锁定，可用 Corepack）

```bash
nvm use
corepack enable
pnpm install
```

## 常用命令

```bash
pnpm dev              # 前后端并行启动
pnpm dev:web          # 仅前端
pnpm dev:service      # 仅后端
pnpm build            # 构建前端
pnpm start:service    # 生产模式启动后端
pnpm lint             # 前端 lint
pnpm test             # 后端测试
```

也可以进入子目录后使用原来的脚本，例如 `pnpm --filter @lottery-tool/web dev`。
