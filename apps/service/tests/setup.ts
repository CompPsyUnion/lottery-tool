// Jest测试全局设置
import dotenv from 'dotenv'

dotenv.config()

// 设置测试环境变量
process.env.NODE_ENV = 'test'
process.env.DB_NAME = process.env.TEST_DB_NAME || 'lottery_system_test'
process.env.JWT_SECRET = 'test-secret-key'

// 全局测试超时设置
jest.setTimeout(30000)

// 清理控制台输出
beforeEach(() => {
  jest.clearAllMocks()
})
