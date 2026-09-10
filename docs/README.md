# 项目文档

独立文档统一存放于此目录；各包与子目录的自述文件（`README.md`）保持在各自位置。

| 文档                                     | 说明                                                    |
| ---------------------------------------- | ------------------------------------------------------- |
| [DEPLOY_EDGEONE.md](./DEPLOY_EDGEONE.md) | 前端部署至腾讯云 EdgeOne Pages（环境变量配置 API 地址） |
| [DEPLOY_BACKEND.md](./DEPLOY_BACKEND.md) | 后端部署（GHCR 镜像 + Docker Compose）                  |
| [KDOCS_WEBHOOK.md](./KDOCS_WEBHOOK.md)   | 金山表单接入配置指南（表单提交 → 抽奖码 + 邮件通知）    |
| [贡献指南](../CONTRIBUTING.md)           | 参与贡献（Fork → 分支 → PR 合并到 main）                |

## 各包自述

- [根 README](../README.md) — monorepo 总览
- [apps/service/README.md](../apps/service/README.md) — 后端（TypeORM + PostgreSQL，含迁移工作流）
- [apps/web/README.md](../apps/web/README.md) — 前端（Vue 3 + Vite）
