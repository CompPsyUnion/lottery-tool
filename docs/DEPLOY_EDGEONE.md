# 前端部署至腾讯云 EdgeOne Pages 指南

本文说明如何将本仓库**仅前端**（`apps/web`，Vue 3 + Vite）部署到腾讯云 EdgeOne Pages，并通过环境变量配置后端 API 地址，无需改动任何代码。

## 前置条件

- 一个 Git 远程仓库（GitHub / GitLab / Gitee 均可），本仓库已推送
- 后端（`apps/service`）已部署并可公网访问，例如 `https://api.example.com`
- 腾讯云账号（已开通 EdgeOne）

## 环境变量说明

前端只认一个关键变量：

| 变量 | 作用 | 示例 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 后端 API 基础地址，构建时注入（见 `src/api.ts`） | `https://api.example.com` |
| `VITE_APP_TITLE` | 页面标题（可选） | `抽奖工具` |

优先级规则（Vite 默认行为）：

1. **构建平台注入的环境变量**（EdgeOne 控制台配置的）优先级最高
2. 其次是 `apps/web/.env.production` 文件中的值（当前写死了 `https://lottery.ibuduan.com/api`，仅影响**本地**执行 `pnpm build` 的产物）

也就是说：在 EdgeOne 上配置了 `VITE_API_BASE_URL` 后，`.env.production` 里的同名值不会生效，无需修改仓库文件。

> 注意：地址指向「后端网关入口」。若网关按路径转发（如 `xxx/api` → 后端根路径），变量需包含该前缀，与现有 `.env.production` 的写法保持一致即可。

## 部署步骤

### 1. 创建项目并关联仓库

1. 登录腾讯云控制台，进入 **EdgeOne → Pages**（或访问 [edgeone.ai/pages](https://edgeone.ai/pages)）
2. 点击 **创建项目**，选择 **导入 Git 仓库**，授权并选中本仓库
3. 分支选择 `main`（或按需指定）

### 2. 配置构建设置

本仓库是 pnpm monorepo，前端在 `apps/web` 子目录，按如下填写：

| 配置项 | 值 | 说明 |
| --- | --- | --- |
| 根目录 | 仓库根目录（留空或 `/`） | 需要在根目录安装 workspace 依赖 |
| 包管理器 | pnpm | 平台根据 `pnpm-lock.yaml` 自动识别 |
| 安装命令 | `pnpm install --frozen-lockfile` | 默认即可 |
| 构建命令 | `pnpm --filter @lottery-tool/web build` | 内部执行 `vue-tsc -b && vite build` |
| 输出目录 | `apps/web/dist` | Vite 默认产物目录 |
| Node 版本 | 20 或以上 | 与仓库 `engines` 要求一致 |

### 3. 配置环境变量

在项目的 **环境变量** 设置中添加：

```text
VITE_API_BASE_URL=https://api.example.com
VITE_APP_TITLE=抽奖工具
```

保存后触发一次部署（或推送任意提交），使变量进入构建产物。

### 4. 验证部署

部署完成后 EdgeOne 会分配一个 `*.edgeone.app` 的预览域名。打开站点确认：

- 页面正常渲染
- 浏览器 DevTools 的 Network 中，登录等请求指向 `VITE_API_BASE_URL` 配置的地址
- 若接口报 CORS 错误 → 见下文「后端配套配置」

### 5. 绑定自定义域名（可选）

在项目 **域名管理** 中添加自己的域名，按提示添加 CNAME 解析即可。EdgeOne 会自动签发 HTTPS 证书。

## SPA 路由回退

前端使用 vue-router 的 **history 模式**（`createWebHistory`），直接访问/刷新 `/activities` 等子路径可能返回 404：

- EdgeOne Pages 识别到 SPA 项目时通常会自动回退到 `index.html`
- 若仍出现 404：在 EdgeOne 控制台为站点添加**重写规则**——将 `/*` 重写到 `/index.html`（保留静态资源直出）

## 后端配套配置

前端跨域调用后端，后端（`apps/service`）需要放开 CORS 来源（见 `src/app.ts` 的 cors 配置）：

```env
# 后端 .env / 部署环境变量
CORS_ORIGIN=https://your-frontend-domain.edgeone.app
```

后端自身的部署与超管引导见 `apps/service/README.md`（TypeORM + PostgreSQL，支持 `SUPER_ADMIN_USERNAME/PASSWORD` 环境变量播种超管）。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 请求仍指向 `localhost:3000` | 环境变量未注入构建：确认在 EdgeOne 配置后**重新部署**；`VITE_` 前缀不可省略 |
| 本地 `pnpm build` 的产物指向旧地址 | 本地构建读取 `apps/web/.env.production`，改该文件或用 `VITE_API_BASE_URL=... pnpm build` 覆盖 |
| 接口 CORS 报错 | 后端 `CORS_ORIGIN` 未包含前端域名 |
| 刷新子路径 404 | SPA 回退未生效，见上节 |
| 构建时类型检查失败 | `vue-tsc` 全量类型检查，先本地 `pnpm --filter @lottery-tool/web build` 复现修复 |

## 本地验证环境变量注入

无需部署即可验证注入效果：

```bash
VITE_API_BASE_URL=https://api.example.com pnpm --filter @lottery-tool/web build
grep -r "api.example.com" apps/web/dist/assets/ && echo "注入成功"
```
