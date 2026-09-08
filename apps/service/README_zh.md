# 抽奖系统后端

🌍 中文版 | [English](README.md)

一个支持多种抽奖模式的完整抽奖系统后端服务，基于 Node.js + Express.js + PostgreSQL 构建。

## 功能特点

- 🎯 **多种抽奖模式**：支持线上抽奖和线下抽奖
- 🔄 **活动状态机**：`draft → ready → active → ended`，60 秒定时任务到点自动开始/结束（流转受矩阵约束，`PATCH /admin/activities/:id/status`）
- 🎫 **抽奖码系统**：支持多种格式的抽奖码生成
- 🧪 **演示测试码**：每个活动一个幂等测试码，抽奖走完整流程（含签字）但不扣库存、不产生真实记录
- ✍️ **签字确认**：线下抽奖可选签字确认（图片存库），记录页支持补签
- 📧 **邮箱验证码**：注册验证码经 email-poster POST webhook 发送（无 SMTP），通道在超管设置页配置
- 🔐 **权限管理**：超级管理员和普通管理员角色
- 🔗 **Webhook支持**：第三方系统可通过Webhook添加抽奖码
- 📊 **完整统计**：详细的抽奖记录和统计数据
- 🛡️ **安全可靠**：JWT认证、操作日志、错误处理

## 技术栈

- **后端框架**：Node.js + Express.js
- **数据库**：PostgreSQL 18+
- **ORM**：TypeORM 1.1
- **认证**：JWT
- **日志**：Winston
- **验证**：express-validator

## 安装和使用

### 1. 环境要求

- Node.js >= 20
- PostgreSQL >= 18
- npm 或 yarn

### 2. 安装依赖

```bash
pnpm install
```

### 3. 启动服务（无安装向导）

首次启动时迁移会自动建表。**首位通过 `/auth/register` 注册的用户自动成为超级管理员**；此后公开注册（默认开启，可由超管在系统设置中关闭）需通过邮箱验证码，或由超管令牌直接创建账户。

```bash
# 生产模式
pnpm start

# 开发模式
pnpm dev
```

创建首位超级管理员（两种方式任选其一）：

方式一：环境变量（部署友好，库为空时启动自动创建）

```env
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=your_password1
SUPER_ADMIN_EMAIL=admin@example.com   # 可选
```

方式二：首位注册（未配置上述变量时生效）

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"your_password1"}'
```

### 4. 测试API

运行自动化测试确保系统正常工作：

```bash
pnpm test
```

## 抽奖码格式支持

系统支持以下抽奖码格式：

| 格式代码                | 描述             | 示例         |
| ----------------------- | ---------------- | ------------ |
| `4_digit_number`        | 4位纯数字        | 1234         |
| `8_digit_number`        | 8位纯数字        | 12345678     |
| `8_digit_alphanumeric`  | 8位数字+小写字母 | 12a34b56     |
| `12_digit_number`       | 12位纯数字       | 123456789012 |
| `12_digit_alphanumeric` | 12位数字+字母    | 12a34B56c78D |

## API使用示例

路由定义见 `src/routes/`（服务直接挂在根路径，如 `POST /auth/login`，无 `/api` 前缀）。

### 管理员登录

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'
```

### 创建活动

```bash
curl -X POST http://localhost:3000/admin/activities \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "春节抽奖活动",
    "description": "新春佳节，好礼相送",
    "lottery_mode": "online",
    "start_time": "2024-02-01T00:00:00.000Z",
    "end_time": "2024-02-15T23:59:59.000Z",
    "settings": {
      "max_lottery_codes": 1000,
      "lottery_code_format": "8_digit_number"
    }
  }'
```

### 批量创建抽奖码

```bash
curl -X POST http://localhost:3000/admin/activities/1/lottery-codes/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "count": 100
  }'
```

### 用户抽奖

```bash
curl -X POST http://localhost:3000/lottery/activities/1/draw \
  -H "Content-Type: application/json" \
  -d '{
    "lottery_code": "12345678"
  }'
```

### 活动状态流转

活动创建后为 `draft`，经 `draft → ready → active → ended` 流转（受矩阵约束，
`ended` 为终态、`ready` 可撤回）。定时任务（60 秒一轮，启动即补扫）在
`start_time` 到点后自动开始（未设置开始时间则立即开始），`end_time` 到点自动结束。

```bash
# 发布（draft → ready）；另有 ready → active（立即开始）、active → ended、ready → draft（撤回）
curl -X PATCH http://localhost:3000/admin/activities/1/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{ "status": "ready" }'

# 幂等获取演示测试码（每活动一个；用它抽奖不扣库存、不产生真实记录）
curl -X POST http://localhost:3000/admin/activities/1/lottery-codes/demo \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Webhook集成

### 获取Webhook信息

```bash
curl -X GET http://localhost:3000/admin/activities/1/webhook-info \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 通过Webhook添加抽奖码

```bash
curl -X POST http://localhost:3000/webhook/activities/WEBHOOK_ID/lottery-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer WEBHOOK_TOKEN" \
  -d '{
    "code": "87654321",
    "participant_info": {
      "name": "张三",
      "phone": "13800138000",
      "email": "zhangsan@example.com"
    }
  }'
```

## 目录结构

```text
apps/service/
├── src/
│   ├── app.ts                 # 应用入口（启动即跑迁移）
│   ├── entities/              # TypeORM 实体（表结构唯一来源）
│   ├── migrations/            # 自动生成的迁移 + index.ts barrel
│   ├── services/              # 业务服务（原 model 静态方法；含 activity-status-scheduler 定时流转）
│   ├── middleware/
│   │   ├── auth.ts           # 认证中间件
│   │   ├── error-handler.ts  # 错误处理
│   │   └── operation-logger.ts # 操作日志
│   ├── routes/               # 路由
│   │   ├── auth.ts          # 认证路由（首位注册即超管；注册邮箱验证码）
│   │   ├── admin/           # 管理员路由
│   │   ├── lottery.ts       # 抽奖路由（draw/offline-draw/签字）
│   │   ├── webhook.ts       # Webhook路由
│   │   └── system.ts        # 系统管理路由（邮件通道配置等）
│   └── utils/
│       ├── database.ts      # DataSource（PG 连接 + 迁移执行）
│       ├── logger.ts
│       ├── custom-error.ts
│       ├── mail-theme.ts    # 邮件 HTML 模板（email-poster 内置模板 + 站点主题）
│       └── lottery-code-generator.ts
├── scripts/                  # 迁移 CLI + API 冒烟（tsup 构建到 scripts/dist）
├── tsup.config.ts / tsup.dev.config.ts
├── docker-compose.yml        # 含 PostgreSQL 18 服务
├── package.json
└── README.md
```

## 环境变量 ENV

系统运行时需要以下环境变量（参照 `.env.example` 配置，或通过环境变量注入）：

```env
# 服务器配置
PORT=3000
NODE_ENV=production

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lottery_system
DB_USER=postgres
DB_PASSWORD=your_password

# JWT配置
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=24h

# 超级管理员引导（可选；库为空时启动自动创建）
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=your_password
SUPER_ADMIN_EMAIL=admin@example.com

# 日志配置
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

注册验证码的邮件通道在超管设置页运行时配置（email-poster POST webhook，无 SMTP 环境变量）。

## Docker 部署说明

容器启动时自动应用迁移；数据库连接失败不退出（等待依赖就绪）。完整的镜像与
Compose 部署步骤（`.env` 优先、PostgreSQL 默认内网）见
[docs/DEPLOY_BACKEND.md](../../docs/DEPLOY_BACKEND.md)。

快速开始：

```bash
cd apps/service
docker compose up -d          # 起 PostgreSQL 18 + 后端（GHCR 镜像）
curl http://localhost:3000/health
```

## 开发说明

### 数据库迁移（TypeORM + PostgreSQL）

表结构由 `src/entities/` 实体定义，通过自动生成的迁移（`src/migrations/`）管理，`synchronize` 始终关闭。服务启动时会自动应用未执行的迁移。

```bash
# 改动实体后，生成迁移（diff 实体与数据库），然后把新类注册进 src/migrations/index.ts
pnpm migration:generate --name=AddUserAvatar

# 应用 / 回滚一步迁移
pnpm migration:run
pnpm migration:revert

# commit 守卫：实体改动必须伴随已注册的新迁移（提交信息含 "bypass migration check" 可跳过）
pnpm migration:check
```

约定：迁移文件为 `<时间戳>-<PascalName>.ts`（up/down 执行 SQL 数组）；生成产物需人工审查（生成器已自动按「约束→索引→表→类型」重排 down 语句）。

### 添加新的抽奖码格式

1. 在 `src/utils/lotteryCodeGenerator.ts` 中添加新格式
2. 更新验证规则
3. 更新API文档

## 故障排除

### 日志查看

```bash
# 查看应用日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log
```

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

## 联系方式

如有问题或建议，请联系开发团队。
