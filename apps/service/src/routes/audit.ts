import express, { Request, Response, NextFunction } from 'express'
import { query } from 'express-validator'
import { authenticateToken, requireAdmin } from '../middleware/auth'
import { createError } from '../utils/custom-error'
import { AUDIT_ACTIONS, findPaginated } from '../services/audit.service'

const router = express.Router()

// 所有审计路由需要管理员权限
router.use(authenticateToken)
router.use(requireAdmin)

/**
 * @route   GET /api/admin/audit
 * @desc    审计日志查询（奖品库存/码量变动与操作者；普通管理员仅自己活动，超管全量）
 * @access  Private (Admin)
 */
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须是1-100的整数'),
    query('activity_id').optional().isInt({ min: 1 }).withMessage('活动ID必须是正整数'),
    query('action')
      .optional()
      .isIn(AUDIT_ACTIONS as unknown as string[])
      .withMessage('动作类型不合法'),
    query('code').optional().isLength({ max: 50 }).withMessage('抽奖码搜索不能超过50个字符'),
    query('start_date').optional().isISO8601().withMessage('开始日期格式不正确'),
    query('end_date').optional().isISO8601().withMessage('结束日期格式不正确'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, activity_id, action, code, start_date, end_date } = req.query as Record<
        string,
        string | undefined
      >

      const result = await findPaginated(
        {
          activity_id: activity_id ? parseInt(activity_id) : undefined,
          action,
          code,
          start_date,
          end_date,
          page: page ? parseInt(page) : undefined,
          limit: limit ? parseInt(limit) : undefined,
        },
        { id: (req as any).user.id, role: (req as any).user.role },
      )

      res.json({
        success: true,
        data: {
          logs: result.logs,
          pagination: result.pagination,
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

export default router
