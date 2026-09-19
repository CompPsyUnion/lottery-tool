# 抽奖工具 v3

[![Vue](https://img.shields.io/badge/Vue-3.x-brightgreen.svg)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-latest-purple.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | [中文](README-cn.md)

一个现代化、易用的抽奖活动管理系统，帮助活动组织者轻松创建和管理抽奖活动。系统设计简洁直观，操作便捷，适用于各类线上线下活动场景。

## 特色功能

支持两种灵活的抽奖模式：

1. **模式一 (线下兑奖)** ：分发抽奖码 → 用户线下前往管理员设备输入兑奖码 → 现场兑换奖品
2. **模式二 (在线兑奖)** ：分发抽奖码 → 用户通过活动发起者提供的链接自行兑奖 → 获取兑奖凭证

## 🚀 技术栈

### 前端

- **Vue 3** - 采用组合式API，提供响应式和组件化的视图构建
- **TypeScript** - 增强代码可维护性和开发体验
- **Vite** - 极速的前端构建工具，提供闪电般的开发体验
- **Vue Router** - 官方路由管理器，实现单页应用导航
- **Pinia** - 直观、类型安全的状态管理解决方案
- **i18n**(开发中) - 完整的国际化支持，轻松切换多语言
- **Shadcn UI** - 精美的UI组件库，提供现代化视觉体验

## 🛠️ 开发指南

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 预览生产构建
pnpm preview
```

## 🔧 配置说明

项目配置文件位于 `src/config` 目录，可根据需要调整以下配置：

- 接口地址
- 主题设置
- 国际化选项
- 其他系统参数

## 👥 贡献指南

我们欢迎所有形式的贡献！

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启一个 Pull Request

文档中提供了LLMs.txt，欢迎各位一起Vibe Coding！

## 📄 许可证

本项目采用 [MIT](LICENSE) 许可证 - 查看 LICENSE 文件了解详情

## 部署

前端部署至腾讯云 EdgeOne Pages（环境变量配置 API 地址）见 [DEPLOY_EDGEONE.md](../../docs/DEPLOY_EDGEONE.md)。
