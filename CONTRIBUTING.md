# 贡献指南

感谢关注 lottery-tool！所有改动通过 **Fork → 从 main 新建自己的分支 → Pull Request 合并回 main** 进入仓库，本文档覆盖完整流程与本地约定。

## 贡献流程

1. **Fork**：将 [CompPsyUnion/lottery-tool](https://github.com/CompPsyUnion/lottery-tool) Fork 到你的账号

2. **克隆并关联上游**：

   ```bash
   git clone https://github.com/<你的用户名>/lottery-tool.git
   cd lottery-tool
   git remote add upstream https://github.com/CompPsyUnion/lottery-tool.git
   ```

3. **开始新工作前同步 main**：

   ```bash
   git checkout main
   git pull upstream main
   git push origin main
   ```

4. **新建自己的分支**：分支名建议与改动类型一致（`feat/xxx`、`fix/xxx`、`docs/xxx`）：

   ```bash
   git checkout -b feat/your-feature
   ```

5. **开发并本地验证**：环境搭建见[根 README](README.md)，提交前自检见下文

6. **推送并发起 PR**：推送到自己的 Fork，向上游 `main` 发起 Pull Request：

   ```bash
   git push -u origin feat/your-feature
   ```

7. **合并后清理**：PR 合并进 `main` 后同步 Fork、删除特性分支：

   ```bash
   git checkout main
   git pull upstream main
   git push origin main
   git branch -d feat/your-feature
   git push origin --delete feat/your-feature
   ```

请勿直接在 `main` 上开发——所有改动经分支与 PR 进入，便于 review 与回溯。

## 环境搭建

```bash
nvm use                 # Node >= 20（.nvmrc 锁定 22）
corepack enable         # pnpm 版本由 packageManager 字段锁定
pnpm install
```

后端需要 PostgreSQL 与 `.env`：

```bash
cd apps/service
cp .env.example .env    # 按需修改端口、数据库、JWT_SECRET
docker compose up -d postgres
```

`pnpm dev` 前后端并行启动，数据库迁移在服务启动时自动应用。

## 提交规范

- 提交信息为单行英文 Conventional Commits，不超过 50 字符，例如
  `feat: add export records csv`、`fix: signature state on pointer up`
- 允许的 type：`feat` `fix` `docs` `style` `refactor` `perf` `test` `build`
  `ci` `chore` `revert`

husky 钩子本地强制执行（`Merge` 开头的合并提交自动放行）：

- **pre-commit**：对 staged 文件做 Prettier / ESLint 检查（只查不修），
  不合规阻断提交——先 `pnpm lint:fix` 修好再提交
- **commit-msg**：校验提交信息格式；实体（`apps/service/src/entities/`）的
  实质改动必须伴随新迁移，否则阻断提交。确有充分理由时在提交信息中加入
  `bypass migration check` 短语跳过

## 数据库迁移

修改 `apps/service/src/entities/` 下的实体时需新增迁移并在
`src/migrations/index.ts` 注册（可用 `migration:generate` 生成后按需调整）。
完整工作流见 [apps/service/README.md](apps/service/README.md) 的迁移章节。

## 提交 PR 前自检

```bash
pnpm lint                                  # ESLint（全部子包）
pnpm format:check                          # Prettier 格式检查
pnpm test                                  # 后端单元测试（无需数据库）
pnpm --filter @lottery-tool/service typecheck
pnpm build                                 # 前端构建（含 vue-tsc 类型检查）
```

## CI 与发布

- push 触发 GitHub Actions 构建后端 Docker 镜像；在 Fork 上推送也会在你的
  命名空间跑同样构建，无需额外配置
- 合并到上游 `main` 后自动构建并推送
  `ghcr.io/comppsyunion/lottery-tool-service`，部署见
  [docs/DEPLOY_BACKEND.md](docs/DEPLOY_BACKEND.md)

## 文档

- 新增独立文档放 `docs/`（索引见 [docs/README.md](docs/README.md)），各包自述
  保持在各自目录
- Markdown 需通过 `pnpm format`（Prettier）与仓库 `.markdownlint.json` 规则
