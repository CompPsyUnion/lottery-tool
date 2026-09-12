# 抽奖系统后端测试文档

## 概述

本项目使用 Jest 作为测试框架。当前保留的测试套件均为不依赖数据库的单元测试；依赖 PostgreSQL 的集成测试已随 TypeORM 重构移除，可基于 `docker compose up -d postgres` 另行重建。

## 测试结构

```text
tests/
├── setup.ts                        # Jest 全局设置（环境变量）
├── unit/
│   ├── auth.test.ts               # 认证中间件单元测试（内置 mock，无依赖）
│   └── lotteryCodeGenerator.test.ts # 抽奖码生成器单元测试
└── utils/
    └── lotteryCodeGenerator.test.ts # 抽奖码生成器测试（含重试机制用例）
```

## 运行测试

```bash
pnpm test              # 运行全部测试
pnpm test:watch        # 监听模式
pnpm test:coverage     # 覆盖率报告
pnpm run test:api      # 对运行中的服务做 API 冒烟（需先启动服务并完成安装）
```

## 配置要点

- Jest 配置在 `package.json`：ts-jest 转译（`tsconfig.test.json`），`testMatch` 为 `*.test.ts`
- 覆盖率统计 `dist/**/*.js`（测试经由编译产物运行前需 `pnpm build`）
- 环境变量：`NODE_ENV=test`、`DB_NAME=lottery_system_test`、`JWT_SECRET=test-secret-key`
