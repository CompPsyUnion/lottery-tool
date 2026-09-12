# Lottery System Backend

🌍 [中文版](README_zh.md) | English

A complete lottery system backend service supporting multiple lottery modes, built with Node.js + Express.js + PostgreSQL.
Provides OpenAPI-compliant JSON protocol documentation for easy API viewing and testing by frontend developers.

## Features

- 🎯 **Multiple Lottery Modes**: Supports online and offline lottery
- 🔐 **Permission Management**: Super admin and regular admin roles
- 🎫 **Lottery Code System**: Supports multiple lottery code generation formats
- 🔗 **Webhook Support**: Third-party systems can add lottery codes via Webhook
- 📊 **Complete Statistics**: Detailed lottery records and statistical data
- 🛡️ **Secure & Reliable**: JWT authentication, operation logs, error handling

## Tech Stack

- **Backend Framework**: Node.js + Express.js
- **Database**: PostgreSQL 16+
- **ORM**: TypeORM 1.1
- **Authentication**: JWT
- **Logging**: Winston
- **Validation**: express-validator

## Installation and Usage

### 1. Requirements

- Node.js >= 16.0.0
- PostgreSQL >= 16
- npm or yarn

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Service (no installer)

On first boot, migrations create the schema automatically. **The first user to register via `/auth/register` becomes the super administrator**; afterwards registration requires a super admin token.

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

| Format Code | Description | Example |
| ------------- | ------------- | ---------- |
| `4_digit_number` | 4-digit numbers only | 1234 |
| `8_digit_number` | 8-digit numbers only | 12345678 |
| `8_digit_alphanumeric` | 8-digit numbers + lowercase letters | 12a34b56 |
| `12_digit_number` | 12-digit numbers only | 123456789012 |
| `12_digit_alphanumeric` | 12-digit numbers + letters | 12a34B56c78D |

## API Usage Examples

Please refer to the API documentation. OpenAPI protocol is provided, and you can import `openapi.json` into Swagger UI or other API tools for testing.

### Admin Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'
```

### Create Activity

```bash
curl -X POST http://localhost:3000/api/admin/activities \
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
curl -X POST http://localhost:3000/api/admin/activities/1/lottery-codes/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "count": 100
  }'
```

### User Lottery Draw

```bash
curl -X POST http://localhost:3000/api/lottery/activities/1/draw \
  -H "Content-Type: application/json" \
  -d '{
    "lottery_code": "12345678"
  }'
```

## Webhook Integration

### Get Webhook Information

```bash
curl -X GET http://localhost:3000/api/admin/activities/1/webhook-info \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Add Lottery Codes via Webhook

```bash
curl -X POST http://localhost:3000/api/webhook/activities/WEBHOOK_ID/lottery-codes \
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

## Directory Structure

```text
apps/service/
├── src/
│   ├── app.ts                 # 应用入口（启动即跑迁移）
│   ├── entities/              # TypeORM 实体（表结构唯一来源）
│   ├── migrations/            # 自动生成的迁移 + index.ts barrel
│   ├── services/              # 业务服务（原 model 静态方法）
│   ├── middleware/
│   │   ├── auth.ts           # 认证中间件
│   │   ├── errorHandler.ts   # 错误处理
│   │   └── operationLogger.ts # 操作日志
│   ├── routes/               # 路由
│   │   ├── auth.ts          # 认证路由（首位注册即超管）
│   │   ├── admin/           # 管理员路由
│   │   ├── lottery.ts       # 抽奖路由
│   │   ├── webhook.ts       # Webhook路由
│   │   └── system.ts        # 系统管理路由
│   └── utils/
│       ├── database.ts      # DataSource（PG 连接 + 迁移执行）
│       ├── logger.ts
│       ├── customError.ts
│       └── lotteryCodeGenerator.ts
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

# Logging configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

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
