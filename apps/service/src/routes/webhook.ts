import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import { authenticateWebhook } from '../middleware/auth'
import { createError } from '../utils/custom-error'
import { getFormatDescription, validateLotteryCodeFormat } from '../utils/lottery-code-generator'
import {
  type KdocsWebhookPayload,
  resolveKdocsFieldMap,
  transformKdocsWebhook,
} from '../utils/kdocs-transformer'
import { renderKdocsNotifyMail } from '../utils/mail-theme'
import logger from '../utils/logger'
import * as LotteryCodeService from '../services/lottery-code.service'
import * as MailService from '../services/mail.service'
import * as OperationLogService from '../services/operation-log.service'
import { AppDataSource } from '../utils/database'
import { LotteryCode } from '../entities/lottery-code.entity'

const router = express.Router()

// 验证请求参数的中间件
const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return next(createError('VALIDATION_INVALID_FORMAT', '请求参数验证失败', errors.array()))
  }
  next()
}

/**
 * @route   POST /api/webhook/activities/:webhook_id/lottery-codes
 * @desc    通过Webhook批量添加抽奖码（第三方系统调用）
 * @access  Webhook (requires webhook token)
 */
router.post(
  '/activities/:webhook_id/lottery-codes',
  [
    authenticateWebhook,

    // 验证lottery_codes数组
    body('lottery_codes')
      .isArray({ min: 1, max: 100 })
      .withMessage('lottery_codes必须是包含1-100个元素的数组'),

    // 验证数组中的每个抽奖码对象
    body('lottery_codes.*.code')
      .notEmpty()
      .withMessage('抽奖码不能为空')
      .isLength({ min: 1, max: 50 })
      .withMessage('抽奖码长度不正确'),

    // 验证参与者信息（可选）
    body('lottery_codes.*.participant_info.name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('姓名长度为1-100个字符'),

    body('lottery_codes.*.participant_info.phone')
      .optional()
      .isMobilePhone('zh-CN')
      .withMessage('手机号格式不正确'),

    body('lottery_codes.*.participant_info.email')
      .optional()
      .isEmail()
      .withMessage('邮箱格式不正确'),
  ],
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lottery_codes } = req.body
      const activity = (req as any).activity // 从中间件获取

      // 获取活动设置
      const settings = activity.settings || {}
      const lotteryCodeFormat = settings.lottery_code_format || '8_digit_number'
      const maxLotteryCodes = settings.max_lottery_codes || 1000

      // 检查是否超过最大限制
      const existingCount = await LotteryCodeService.countByActivity(activity.id)

      if (existingCount + lottery_codes.length > maxLotteryCodes) {
        throw createError(
          'VALIDATION_OUT_OF_RANGE',
          `批量添加后将超过活动最大抽奖码限制 ${maxLotteryCodes}`,
        )
      }

      const createdCodes: LotteryCode[] = []
      const failedCodes: string[] = []
      let createdCount = 0
      let failedCount = 0

      // 批量处理抽奖码
      for (const lotteryCodeData of lottery_codes) {
        try {
          const { code, participant_info } = lotteryCodeData

          // 验证抽奖码格式
          if (!validateLotteryCodeFormat(code, lotteryCodeFormat)) {
            failedCodes.push(code)
            failedCount++
            continue
          }

          // 检查抽奖码是否已存在
          const existingCode = await LotteryCodeService.findByActivityAndCode(activity.id, code)
          if (existingCode) {
            failedCodes.push(code)
            failedCount++
            continue
          }

          // 创建抽奖码
          const lotteryCode = await AppDataSource.getRepository(LotteryCode).save({
            activity_id: activity.id,
            code,
            participant_info: (participant_info as LotteryCode['participant_info']) || null,
            status: 'unused',
          })

          createdCodes.push(lotteryCode)
          createdCount++

          // 记录操作日志
          await OperationLogService.log({
            user_id: null, // Webhook调用没有用户ID
            operation_type: OperationLogService.OPERATION_TYPES.WEBHOOK_CREATE_LOTTERY_CODE,
            operation_detail: `Webhook创建抽奖码: ${code}`,
            target_type: 'ACTIVITY',
            target_id: activity.id,
            ip_address: req.ip,
            user_agent: req.get('User-Agent') || null,
          })
        } catch {
          failedCodes.push(lotteryCodeData.code)
          failedCount++
        }
      }

      res.status(201).json({
        success: true,
        data: {
          created_count: createdCount,
          failed_count: failedCount,
          failed_codes: failedCodes,
          lottery_codes: createdCodes.map((code) => ({
            id: code.id,
            code: code.code,
            status: code.status,
            participant_info: code.participant_info,
            created_at: code.created_at,
          })),
        },
        message: `成功创建 ${createdCount} 个抽奖码${failedCount > 0 ? `，${failedCount} 个创建失败` : ''}`,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * @route   POST /webhook/activities/:webhook_id/kdocs
 * @desc    接收金山表单（KDocs）webhook：答案转为抽奖码入库并发通知邮件
 *          （独立中间件 Lottery-Tool-Middleware 内嵌化；邮件走本系统通道，替代 Power Automate）
 * @access  Webhook（Authorization: Bearer 头 或 ?token= 查询参数——表单系统只能配 URL）
 */
router.post(
  '/activities/:webhook_id/kdocs',
  [
    authenticateWebhook,

    // 金山载荷宽松校验：字段级合法性由转换器判定
    body('event').optional().isString(),
    body('answerContents').optional().isArray(),
    body('answerContents.*.qid').optional().isString(),
  ],
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = req.body as KdocsWebhookPayload
      const activity = (req as any).activity // 从中间件获取
      const settings = activity.settings || {}

      // 只处理创建答案事件（其他事件确认接收但不处理）
      if (payload.event !== 'create_answer') {
        return res.status(200).json({
          success: true,
          message: '事件已接收但未处理',
          event: payload.event ?? null,
        })
      }

      // 字段映射：活动配置覆盖默认 qid（原中间件对接表单）
      const fieldMap = resolveKdocsFieldMap(settings.kdocs_field_map)
      const { code, participantInfo, missingFields } = transformKdocsWebhook(payload, fieldMap)

      if (missingFields.length > 0) {
        throw createError('VALIDATION_MISSING_PARAMS', `缺少必要字段：${missingFields.join('、')}`)
      }

      // 抽奖码格式须符合活动配置（学号按字符串处理）
      const lotteryCodeFormat = settings.lottery_code_format || '8_digit_number'
      if (!validateLotteryCodeFormat(code as string, lotteryCodeFormat)) {
        throw createError(
          'VALIDATION_INVALID_FORMAT',
          `抽奖码 ${code} 不符合活动格式（${getFormatDescription(lotteryCodeFormat)}）`,
        )
      }

      // 配额检查
      const maxLotteryCodes = settings.max_lottery_codes || 1000
      const existingCount = await LotteryCodeService.countByActivity(activity.id)
      if (existingCount + 1 > maxLotteryCodes) {
        throw createError(
          'VALIDATION_OUT_OF_RANGE',
          `添加后将超过活动最大抽奖码限制 ${maxLotteryCodes}`,
        )
      }

      // 重复提交 / 表单重试：幂等返回，不算失败
      const duplicateResponse = () =>
        res.status(200).json({
          success: true,
          data: { code, name: participantInfo.name ?? null, created: false },
          message: '抽奖码已存在，未重复创建',
        })
      const existingCode = await LotteryCodeService.findByActivityAndCode(
        activity.id,
        code as string,
      )
      if (existingCode) {
        return duplicateResponse()
      }

      try {
        await AppDataSource.getRepository(LotteryCode).save({
          activity_id: activity.id,
          code,
          participant_info: Object.keys(participantInfo).length > 0 ? participantInfo : null,
          status: 'unused',
        })
      } catch (error) {
        // 并发竞态撞唯一索引（uq_lottery_codes_activity_code）同样按幂等处理
        if ((error as { code?: string }).code === '23505') {
          return duplicateResponse()
        }
        throw error
      }

      await OperationLogService.log({
        user_id: null, // 表单侧调用没有用户ID
        operation_type: OperationLogService.OPERATION_TYPES.KDOCS_CREATE_LOTTERY_CODE,
        operation_detail: `金山表单创建抽奖码: ${code}`,
        target_type: 'ACTIVITY',
        target_id: activity.id,
        ip_address: req.ip,
        user_agent: req.get('User-Agent') || null,
      })

      // 通知邮件（替代原 Power Automate 通道）：fire-and-forget，失败不影响 webhook 响应
      if (settings.kdocs_notify !== false && participantInfo.email) {
        void (async () => {
          try {
            const mailConfig = await MailService.getMailConfig()
            if (!mailConfig?.postUrl) {
              logger.warn('金山表单通知邮件跳过：邮件通道未配置')
              return
            }
            await MailService.sendMail(mailConfig, {
              to: participantInfo.email as string,
              // 主题不含抽奖码（锁屏通知会展示主题行，码只放正文）
              subject: `报名成功：「${activity.name as string}」抽奖码已生成`,
              body: await renderKdocsNotifyMail(
                activity.name as string,
                code as string,
                participantInfo.name ?? '参与者',
              ),
              html: true,
            })
          } catch (error) {
            logger.error(
              `金山表单通知邮件发送失败（抽奖码 ${code}）：${error instanceof Error ? error.message : String(error)}`,
            )
          }
        })()
      }

      // 绑定码（可选）：活动配置的原样返回值，用于表单侧展示
      const bindCode =
        typeof settings.kdocs_bind_code === 'string' && settings.kdocs_bind_code !== ''
          ? settings.kdocs_bind_code
          : undefined

      return res.status(201).json({
        success: true,
        data: {
          code,
          name: participantInfo.name ?? null,
          created: true,
          ...(bindCode ? { bind_code: bindCode } : {}),
        },
        message: '抽奖码创建成功',
      })
    } catch (error) {
      next(error)
    }
  },
)

export default router
