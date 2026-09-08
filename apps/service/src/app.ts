import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { initDataSource, AppDataSource } from './utils/database'
import { seedSuperAdminFromEnv } from './services/user.service'
import { startScheduler } from './services/activity-status-scheduler'
import errorHandler from './middleware/error-handler'

dotenv.config()

// 检查是否在Docker/生产环境中（数据库连接失败时不退出，等待依赖就绪）
const isRuntimeEnvironment = (): boolean => {
  return process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production' || false
}

export const createApp = async (): Promise<void> => {
  const app = express()

  // 安全中间件
  app.use(helmet())
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
    }),
  )

  // 限流中间件
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 1000, // 每个IP最多1000次请求
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: '请求频率过高，请稍后再试',
      },
    },
  })
  app.use('/api', limiter)

  // 解析中间件
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // 日志中间件
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.info(`${req.method} ${req.url} - ${req.ip}`)
    next()
  })

  // 数据库连接 + 自动应用pending迁移（与 pnpm migration:run 同一代码路径）
  // 超级管理员引导：配置了 SUPER_ADMIN_USERNAME/PASSWORD 则启动时播种；
  // 否则首位通过 /auth/register 注册的用户自动成为超级管理员
  try {
    await initDataSource()
    if (await seedSuperAdminFromEnv()) {
      console.log(`[bootstrap] 已按环境变量创建超级管理员: ${process.env.SUPER_ADMIN_USERNAME}`)
    }
  } catch (error) {
    console.error('数据库连接失败:', error)
    // 在Docker/生产环境中，如果数据库连接失败，不要立即退出
    if (isRuntimeEnvironment()) {
      console.log('数据库连接失败，但应用将继续启动...')
      console.log('请检查数据库配置和环境变量')
    } else {
      process.exit(1)
    }
  }

  // 活动状态定时流转（启动即补扫停机期间到点的活动，之后每分钟一轮）
  if (AppDataSource.isInitialized) {
    startScheduler()
  }

  // 路由
  app.use('/auth', require('./routes/auth').default)
  app.use('/admin', require('./routes/admin').default)
  app.use('/lottery', require('./routes/lottery').default)
  app.use('/lottery-codes', require('./routes/lottery-code').default)
  app.use('/webhook', require('./routes/webhook').default)
  app.use('/system', require('./routes/system').default)
  app.use('/dashboard', require('./routes/dashboard').default)

  // 健康检查
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version,
      },
    })
  })

  // 404处理
  app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '请求的资源不存在',
      },
    })
  })

  // 错误处理中间件
  app.use(errorHandler)

  const PORT = Number(process.env.PORT) || 3000
  app.listen(PORT, '0.0.0.0', () => {
    console.info(`服务器已启动，端口: ${PORT}`)
    console.info(`健康检查: http://localhost:${PORT}/health`)
  })
}

// 启动应用
createApp().catch((error) => {
  console.error('应用启动失败:', error)
  process.exit(1)
})
