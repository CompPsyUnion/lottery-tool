# 后端部署指南（GHCR 镜像）

后端通过 GitHub Actions 自动构建镜像并推送至 GHCR，本文说明用 Docker Compose 部署的完整流程。

- 镜像地址：`ghcr.io/comppsyunion/lottery-tool-service`（**public**，无需登录即可拉取）
- 触发构建：push 到 main 分支且改动涉及后端（`apps/service/**`、依赖清单、Dockerfile 等）
- 标签约定：主分支 `latest`（最新）与 `main-<短sha>`；其他分支 `develop` 与 `develop-<短sha>`（均可精确锁定/回滚）

## 一、最快部署（Compose 一键起）

compose 文件在 [`apps/service/docker-compose.yml`](../apps/service/docker-compose.yml)，包含 PostgreSQL 18 与后端两个服务。所有环境变量采用「**同目录 `.env` 优先，未设置回退默认值**」的形式——`.env` 缺任何一项都能起服务，改哪项覆盖哪项。

```bash
# 1) 取得部署文件（放在任意空目录即可）
mkdir lottery && cd lottery
curl -O https://raw.githubusercontent.com/CompPsyUnion/lottery-tool/main/apps/service/docker-compose.yml

# 2) 下载环境变量模板并按需修改（至少改 JWT_SECRET；数据库密码在 POSTGRES_* 段取消注释修改）
curl -o .env https://raw.githubusercontent.com/CompPsyUnion/lottery-tool/main/apps/service/.env.example
vi .env

# 3) 启动
docker compose up -d

# 4) 观察启动日志（首次启动会自动建表跑迁移）
docker compose logs -f lottery-backend
```

健康检查通过后访问：`http://<服务器>:3000/health`（端口由 `.env` 的 `BACKEND_PORT` 控制，默认 3000）

> 服务器需已安装 Docker Engine（含 compose v2 插件）。数据库凭据只需改 `.env` 里的 `POSTGRES_*` 三项——后端的 `DB_*` 自动复用同一来源，无需重复配置。

## 二、环境变量说明（.env）

完整模板见 [`apps/service/.env.example`](../apps/service/.env.example)（本地开发与 Docker 部署共用），全部可选——未设置时使用 compose 内置默认值：

| 变量                                            | 建议必改 | 默认值                | 说明                                                                                                    |
| ----------------------------------------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD`           | ✓        | `lottery` / `lottery` | 数据库账号（postgres 初始化 + 后端连接共用）                                                            |
| `POSTGRES_DB`                                   |          | `lottery_system`      | 数据库名                                                                                                |
| `POSTGRES_PORT`                                 |          | `5432`                | postgres 对宿主机暴露的端口（默认**不暴露**，仅 docker 内网；需外部连库时在 compose 中取消 ports 注释） |
| `DB_HOST`                                       |          | `postgres`            | 外部数据库时改为实际地址（见第三节）                                                                    |
| `JWT_SECRET`                                    | ✓        | 占位值                | JWT 签名密钥（`openssl rand -hex 32`）                                                                  |
| `JWT_EXPIRES_IN`                                |          | `24h`                 |                                                                                                         |
| `BACKEND_PORT`                                  |          | `3000`                | 后端对宿主机暴露的端口                                                                                  |
| `BACKEND_IMAGE`                                 |          | `...:latest`          | 镜像及版本锁定（见第四节）                                                                              |
| `CORS_ORIGIN`                                   |          | `*`                   | 前端域名，多域名逗号分隔                                                                                |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` | 可选     | 空                    | 两者同时设置且用户表为空时，启动自动创建超管（见下）                                                    |
| `SUPER_ADMIN_EMAIL`                             | 可选     | 空                    | 超管邮箱                                                                                                |

### 超级管理员引导（二选一）

1. **环境变量**（部署友好）：设置 `SUPER_ADMIN_USERNAME` + `SUPER_ADMIN_PASSWORD`（可选 `SUPER_ADMIN_EMAIL`），空库启动即自动创建
2. **首位注册**：未设置上述变量时，第一个调用注册接口的用户自动成为超管

```bash
curl -X POST http://<服务器>:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"your_password1"}'
```

> 两种方式互斥：仅当用户表为空时生效；已有用户后注册需超管令牌。

## 三、使用外部数据库（可选）

去掉 compose 中的 `postgres` 服务与 `depends_on`，在 `.env` 中将 `DB_HOST` 指向外部 PostgreSQL 16+：

```dotenv
DB_HOST=your-db.example.com
POSTGRES_USER=your-user
POSTGRES_PASSWORD=your-password
POSTGRES_DB=your-db
```

要求：空库即可（启动自动建表迁移），数据库需 UTF-8 编码。

## 四、版本锁定与升级

```bash
# 固定到某次提交（推荐生产使用；sha 见 Actions 构建日志或 Packages 版本列表）
# 在 .env 中设置：
#   BACKEND_IMAGE=ghcr.io/comppsyunion/lottery-tool-service:main-30a7566

# 升级到最新（.env 未锁定 BACKEND_IMAGE 时）
docker compose pull lottery-backend && docker compose up -d lottery-backend

# 回滚：.env 改回旧 sha tag 后
docker compose up -d lottery-backend
```

迁移随镜像启动自动执行（`migration:run` 同一代码路径），升级无需手动操作数据库。

## 五、常见问题

| 现象                                        | 处理                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 启动日志 `数据库连接失败，但应用将继续启动` | `DOCKER_ENV` 模式下不退出，等数据库就绪后重启容器：`docker compose restart lottery-backend`                      |
| 前端跨域报错                                | `CORS_ORIGIN` 设为前端完整域名                                                                                   |
| 拉镜像 401                                  | 本镜像为 public 无需登录；若你用的是 fork 私有镜像，先 `docker login ghcr.io`（用户名 + PAT with read:packages） |
| 忘记超管密码                                | 用户表清空后重新引导，或用另一个超管在系统设置中重置                                                             |

## 相关文档

- 前端部署（EdgeOne Pages）：[DEPLOY_EDGEONE.md](./DEPLOY_EDGEONE.md)
- 数据库迁移工作流：[apps/service/README.md](../apps/service/README.md)
