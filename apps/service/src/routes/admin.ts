import express from 'express'
import { authenticateToken, requireAdmin } from '../middleware/auth'

const router = express.Router()

// 所有admin路由都需要认证和管理员权限
router.use(authenticateToken)
router.use(requireAdmin)

// 子路由
router.use('/activities', require('./admin/activities').default)
router.use('/prizes', require('./admin/prizes').default)
router.use('/lottery-codes', require('./admin/lottery-code').default)
router.use('/lottery-records', require('./admin/lottery-record').default)

export default router
