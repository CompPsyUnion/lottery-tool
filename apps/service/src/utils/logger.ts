import winston from 'winston'
import path from 'path'
import fs from 'fs'

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`
  }),
)

// 创建logger实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // 所有日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
})

// 控制台输出始终开启：Docker 部署下 stdout 即 docker logs（按 NODE_ENV 关闭会让
// 生产环境的 error/warn 在容器日志里消失，只落容器内文件，排障不可见）
logger.add(
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }),
)

export default logger
