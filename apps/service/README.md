# Lottery System Backend

🌍 [中文版](README_zh.md) | English

A complete lottery system backend service supporting multiple lottery modes, built with Node.js + Express.js + PostgreSQL.

## Features

- 🎯 **Multiple Lottery Modes**: Supports online and offline lottery
- 🔄 **Activity Lifecycle**: `draft → ready → active → ended` with a 60s scheduler that auto-starts ready activities at `start_time` and auto-ends them at `end_time` (transitions guarded by a state matrix, `PATCH /admin/activities/:id/status`)
- 🎫 **Lottery Code System**: Supports multiple lottery code generation formats
- 🧪 **Demo Test Codes**: Each activity has one idempotent test code — draws run the full flow (including signature) without touching prize stock or real records
- ✍️ **Signature Confirmation**: Optional post-draw signature for offline mode (stored in DB), with resign support from the records page
- 📧 **Email Verification Codes**: Registration codes sent via an email-poster POST webhook (no SMTP); channel configured in the super admin settings page
- 🔐 **Permission Management**: Super admin and regular admin roles
- 🔗 **Webhook Support**: Third-party systems can add lottery codes via Webhook
- 📊 **Complete Statistics**: Detailed lottery records and statistical data
- 🛡️ **Secure & Reliable**: JWT authentication, operation logs, error handling

## Tech Stack

- **Backend Framework**: Node.js + Express.js
- **Database**: PostgreSQL 18+
- **ORM**: TypeORM 1.1
- **Authentication**: JWT
- **Logging**: Winston
- **Validation**: express-validator

## Installation and Usage

### 1. Requirements

- Node.js >= 20
- PostgreSQL >= 18
- npm or yarn

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Service (no installer)

On first boot, migrations create the schema automatically. **The first user to register via `/auth/register` becomes the super administrator**; afterwards public registration (on by default, toggleable by the super admin) requires an email verification code — or accounts can be created directly with a super admin token.

```bash
# Production mode
pnpm start

# Development mode
pnpm dev
```

Create the first super admin (either way):

Option A: environment variables (deployment-friendly; auto-created on boot when the user table is empty)

```env
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=your_password1
SUPER_ADMIN_EMAIL=admin@example.com   # optional
```

Option B: first registration (effective when the variables above are unset)

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"your_password1"}'
```

### 4. Test API

Run automated tests to ensure the system works properly:

```bash
pnpm test
```

## Lottery Code Format Support

The system supports the following lottery code formats:

| Format Code             | Description                         | Example      |
| ----------------------- | ----------------------------------- | ------------ |
| `4_digit_number`        | 4-digit numbers only                | 1234         |
| `8_digit_number`        | 8-digit numbers only                | 12345678     |
| `8_digit_alphanumeric`  | 8-digit numbers + lowercase letters | 12a34b56     |
| `12_digit_number`       | 12-digit numbers only               | 123456789012 |
| `12_digit_alphanumeric` | 12-digit numbers + letters          | 12a34B56c78D |

## API Usage Examples

Routes live under `src/routes/` (no `/api` prefix — the service serves them at the root, e.g. `POST /auth/login`).

### Admin Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'
```

### Create Activity

```bash
curl -X POST http://localhost:3000/admin/activities \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Spring Festival Lottery",
    "description": "Spring Festival celebration with great prizes",
    "lottery_mode": "online",
    "start_time": "2024-02-01T00:00:00.000Z",
    "end_time": "2024-02-15T23:59:59.000Z",
    "settings": {
      "max_lottery_codes": 1000,
      "lottery_code_format": "8_digit_number"
    }
  }'
```

### Batch Create Lottery Codes

```bash
curl -X POST http://localhost:3000/admin/activities/1/lottery-codes/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "count": 100
  }'
```

### User Lottery Draw

```bash
curl -X POST http://localhost:3000/lottery/activities/1/draw \
  -H "Content-Type: application/json" \
  -d '{
    "lottery_code": "12345678"
  }'
```

### Activity Lifecycle

Activities are created as `draft` and move through `draft → ready → active → ended`
(transitions are guarded; `ended` is final, `ready` can be withdrawn). A scheduler
(60s interval, catch-up on boot) starts `ready` activities once `start_time` passes
(no `start_time` = starts immediately) and ends them at `end_time`.

```bash
# Publish (draft → ready); also: ready → active (start now), active → ended, ready → draft (withdraw)
curl -X PATCH http://localhost:3000/admin/activities/1/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{ "status": "ready" }'

# Idempotent demo test code (one per activity; draws bypass stock/records)
curl -X POST http://localhost:3000/admin/activities/1/lottery-codes/demo \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Webhook Integration

### Get Webhook Information

```bash
curl -X GET http://localhost:3000/admin/activities/1/webhook-info \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Add Lottery Codes via Webhook

```bash
curl -X POST http://localhost:3000/webhook/activities/WEBHOOK_ID/lottery-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer WEBHOOK_TOKEN" \
  -d '{
    "code": "87654321",
    "participant_info": {
      "name": "John Doe",
      "phone": "13800138000",
      "email": "zhangsan@example.com"
    }
  }'
```

> Both webhook endpoints accept the token either as an `Authorization: Bearer` header
> (preferred) or as a `?token=` query parameter (fallback — form platforms such as
> KDocs can only configure a URL and cannot set custom headers). Query tokens are
> redacted (`token=***`) in request logs; regenerate a compromised token via
> `POST /admin/activities/:id/webhook-token/regenerate` (old token invalidates immediately).

### KDocs (金山表单) Webhook

`POST /webhook/activities/WEBHOOK_ID/kdocs` — receives KDocs form submissions
(`create_answer` events only; other events are acked with 200 but skipped), maps answer
fields to a lottery code (student ID) + participant info, and sends a sign-up
confirmation email through the system mail channel (replaces the former standalone
Python middleware + Power Automate flow).

```bash
curl -X POST "http://localhost:3000/webhook/activities/WEBHOOK_ID/kdocs?token=WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "create_answer",
    "formId": "form-001",
    "answerContents": [
      { "qid": "k9ce0p", "title": "姓名｜Name", "value": "张三" },
      { "qid": "br1kvx", "title": "学号｜Student ID", "value": "20230001" },
      { "qid": "30f4xe", "title": "UNNC邮箱｜UNNC Email", "value": "zhangsan@unnc.edu.cn" },
      { "qid": "7wpvum", "title": "手机号｜Telephone Number", "value": "13800138000" }
    ]
  }'
```

- Field mapping: per-activity `settings.kdocs_field_map` (`{name, student_id, email,
phone}` qids; defaults to the original UNNC form's qids shown above).
  `settings.kdocs_bind_code` is **required for the KDocs URL binding step**: KDocs
  probes the URL during configuration and expects `{"bind_code": "..."}` — a `GET`
  (or non-submission `POST`) returns exactly that once configured.
  `settings.kdocs_notify` (default on) toggles the confirmation email.
- Name and student ID are required (400 with the missing field names otherwise);
  phone/email are best-effort. The student ID must match the activity's
  `lottery_code_format`; duplicate submissions are idempotent (200 `created: false`).
- Responses: `200` with a **top-level `bind_code`** (when configured) on creation and
  duplicates — KDocs' "verify and bind" step sends a full sample submission and requires
  HTTP 200 + `bind_code` in the response. The sample submission creates a real lottery
  code; clean it up after binding. `200` skip for non-create events. Email failures are
  logged but never fail the webhook response.

## Directory Structure

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

## Environment Variables

The system requires the following environment variables at runtime (see `.env.example`):

```env
# Server configuration
PORT=3000
NODE_ENV=production

# Database configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lottery_system
DB_USER=root
DB_PASSWORD=your_password

# JWT configuration
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=24h

# Super admin bootstrap (optional; auto-created on boot when the user table is empty)
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=your_password
SUPER_ADMIN_EMAIL=admin@example.com

# Logging configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

The email channel for registration verification codes is configured at runtime on
the super admin settings page (email-poster POST webhook — no SMTP env vars).

## Development Notes

### Database Migrations (TypeORM + PostgreSQL)

The schema is defined by the entities in `src/entities/` and managed through auto-generated migrations in `src/migrations/`; `synchronize` stays off. Pending migrations are applied automatically on boot.

```bash
# After changing an entity, generate a migration (diff entities vs database),
# then register the new class in src/migrations/index.ts
pnpm migration:generate --name=AddUserAvatar

# Apply / revert one migration
pnpm migration:run
pnpm migration:revert

# Commit guard: entity changes must ship with a new registered migration
# (include "bypass migration check" in the commit message to skip)
pnpm migration:check
```

Conventions: migration files are `<timestamp>-<PascalName>.ts` (up/down execute SQL arrays); generated output requires human review (the generator already reorders down statements as constraints → indexes → tables → types).

### Adding New Lottery Code Formats

1. Add new format in `src/utils/lotteryCodeGenerator.ts`
2. Update validation rules
3. Update API documentation

## Troubleshooting

### View Logs

```bash
# View application logs
tail -f logs/app.log

# View error logs
tail -f logs/error.log
```

## Contributing

1. Fork the project
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License

## Contact

For questions or suggestions, please contact the development team.
