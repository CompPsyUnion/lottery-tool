import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import { authenticateToken, requireAdmin } from '../middleware/auth'
import { logLotteryDraw } from '../middleware/operation-logger'
import { createError } from '../utils/custom-error'
import { AppDataSource } from '../utils/database'
import { Activity } from '../entities/activity.entity'
import { LotteryRecord } from '../entities/lottery-record.entity'
import { Prize } from '../entities/prize.entity'
import { LotteryCode } from '../entities/lottery-code.entity'
import { generateLotteryCode } from '../utils/lottery-code-generator'
import { renderEmailDrawMail } from '../utils/mail-theme'
import * as ActivityService from '../services/activity.service'
import * as LotteryCodeService from '../services/lottery-code.service'
import * as PrizeService from '../services/prize.service'
import * as LotteryRecordService from '../services/lottery-record.service'
import * as MailService from '../services/mail.service'
import { checkEmailDrawSendLimit } from '../services/email-code.service'
import { OPERATION_TYPES, log as writeOperationLog } from '../services/operation-log.service'

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
 * @route   GET /api/lottery/activities
 * @desc    公开的可参与活动列表（进行中，线上/线下均列出；首页「参与活动」直接点入）
 * @access  Public
 */
router.get('/activities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activities = await AppDataSource.getRepository(Activity)
      .createQueryBuilder('activity')
      .where('activity.status = :status', { status: 'active' })
      .orderBy('activity.created_at', 'DESC')
      .getMany()

    // 时间窗过滤（active 但未到开始/已过结束的不列出；null 安全判定复用共享逻辑）
    const open = activities.filter(
      (activity) => ActivityService.getActivityOpenState(activity).open === true,
    )

    // 只返回公开字段（不含 settings / webhook 凭据）；线下活动抽奖页会提示需管理员登录操作
    res.json({
      success: true,
      data: {
        activities: open.map((activity) => ({
          id: activity.id,
          name: activity.name,
          description: activity.description,
          lottery_mode: activity.lottery_mode,
          start_time: activity.start_time,
          end_time: activity.end_time,
        })),
      },
    })
  } catch (error) {
    next(error)
  }
})

/**
 * @route   GET /api/lottery/activities/:id
 * @desc    获取活动的抽奖信息（公开接口）
 * @access  Public
 */
router.get('/activities/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id

    const activity = await ActivityService.findById(parseInt(activityId))

    if (!activity) {
      throw createError('BUSINESS_ACTIVITY_NOT_FOUND')
    }

    // 只返回公开信息（奖品按 sort_order 排序，只取公开字段）
    const [prizes, lotteryCodesCount] = await Promise.all([
      PrizeService.findByActivity(parseInt(activityId)),
      LotteryCodeService.countByActivity(parseInt(activityId)),
    ])

    res.json({
      success: true,
      data: {
        activity: {
          id: activity.id,
          name: activity.name,
          description: activity.description,
          status: activity.status,
          lottery_mode: activity.lottery_mode,
          start_time: activity.start_time,
          end_time: activity.end_time,
          settings: {
            require_signature: activity.settings?.require_signature === true,
            // 抽奖页据此设置输入框 maxlength/输入过滤（此前不透出导致 12 位格式码被截断）
            lottery_code_format: activity.settings?.lottery_code_format || '8_digit_number',
            // 邮箱即抽：开启时抽奖页切换为邮箱前缀输入（后缀展示 + 次数限制）
            email_draw: {
              enabled: getEmailDrawSettings(activity).enabled === true,
              domain_suffix: getEmailDrawSettings(activity).domain_suffix || '',
              max_per_email: getEmailDrawSettings(activity).max_per_email || 1,
              // false = 点击链接的设备仅确认参与，提示回原提交页（大屏）查看结果
              show_result_on_click: getEmailDrawSettings(activity).show_result_on_click !== false,
            },
          },
        },
        prizes: prizes.map((prize) => ({
          id: prize.id,
          name: prize.name,
          description: prize.description,
          total_quantity: prize.total_quantity,
        })),
        lottery_codes_count: lotteryCodesCount,
      },
    })
  } catch (error) {
    next(error)
  }
})

/**
 * @route   POST /api/lottery/activities/:id/draw
 * @desc    用户使用抽奖码参与线上抽奖
 * @access  Public
 */
router.post(
  '/activities/:id/draw',
  [
    body('lottery_code')
      .notEmpty()
      .withMessage('抽奖码不能为空')
      .isLength({ min: 1, max: 50 })
      .withMessage('抽奖码长度不正确'),
  ],
  validateRequest,
  logLotteryDraw(OPERATION_TYPES.ONLINE_LOTTERY),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const activityId = req.params.id
      const { lottery_code } = req.body

      // 整个抽奖流程在单个事务中（异常自动回滚）
      const { responseData, message } = await AppDataSource.transaction(async (manager) => {
        // 查找活动
        const activity = await manager
          .getRepository(Activity)
          .findOneBy({ id: parseInt(activityId) })
        if (!activity) {
          throw createError('BUSINESS_ACTIVITY_NOT_FOUND')
        }

        // 查找抽奖码
        const lotteryCodeRecord = await LotteryCodeService.findByActivityAndCode(
          parseInt(activityId),
          lottery_code,
          manager,
        )
        if (!lotteryCodeRecord) {
          throw createError('BUSINESS_LOTTERY_CODE_NOT_FOUND', '抽奖码不存在或不属于此活动')
        }

        // 测试抽奖码短路：概率照算走完整体验，但不扣库存、不置 used；
        // 写一条 is_test 测试记录（复用不堆积）以支撑签字流程测试。
        // 置于状态/时间/used 检查之前——测试码无视活动起止与状态，「永远可抽」
        if (lotteryCodeRecord.is_test) {
          const demoPrize = await PrizeService.selectByProbability(parseInt(activityId), activity, {
            manager,
          })
          const demoWinner = !!demoPrize
          const demoRecord = await LotteryRecordService.upsertDemoRecord(
            {
              activity_id: parseInt(activityId),
              lottery_code_id: lotteryCodeRecord.id,
              prize_id: demoPrize ? demoPrize.id : null,
              is_winner: demoWinner,
              operator_id: null,
              ip_address: req.ip,
              user_agent: req.get('User-Agent'),
            },
            manager,
          )
          const demoData: Record<string, unknown> = {
            is_winner: demoWinner,
            is_demo: true,
            lottery_record: {
              id: demoRecord.id,
              created_at: demoRecord.created_at,
            },
            lottery_code: {
              code: lotteryCodeRecord.code,
              participant_info: lotteryCodeRecord.participant_info || {},
            },
          }
          if (demoPrize) {
            demoData.prize = {
              id: demoPrize.id,
              name: demoPrize.name,
              description: demoPrize.description,
            }
          }
          return {
            responseData: demoData,
            message: demoWinner ? '恭喜您中奖了！' : '很遗憾，您没有中奖',
          }
        }

        // 检查活动是否可以抽奖（真实码路径；测试码已在上方短路放行）
        const canStart = ActivityService.canStartLottery(activity)
        if (!canStart.canStart) {
          throw createError('BUSINESS_ACTIVITY_NOT_STARTED', canStart.reason)
        }

        // 检查抽奖码是否已使用
        if (lotteryCodeRecord.status === 'used') {
          throw createError('BUSINESS_LOTTERY_CODE_USED')
        }

        // 检查是否已经抽过奖
        const existingRecord = await manager.getRepository(LotteryRecord).findOneBy({
          lottery_code_id: lotteryCodeRecord.id,
        } as any)

        if (existingRecord) {
          throw createError('BUSINESS_LOTTERY_CODE_USED', '该抽奖码已参与过抽奖')
        }

        // 执行抽奖逻辑
        let isWinner = false
        let selectedPrize: Prize | null = null

        // 根据概率选择奖品（内部会处理总和>1抛错，总和<1可能未中奖）
        const selectedPrizeRecord = await PrizeService.selectByProbability(
          parseInt(activityId),
          activity,
          { manager },
        )

        if (selectedPrizeRecord && selectedPrizeRecord.remaining_quantity > 0) {
          isWinner = true
          selectedPrize = selectedPrizeRecord

          // 扣减库存（在事务中）
          await PrizeService.deductStock(selectedPrize, 1, manager)
        } else {
          isWinner = false
          selectedPrize = null
        }

        // 标记抽奖码为已使用（在事务中）
        await LotteryCodeService.markAsUsed(lotteryCodeRecord, manager)

        // 创建抽奖记录（在事务中）
        const lotteryRecord = await LotteryRecordService.createRecord(
          {
            activity_id: parseInt(activityId),
            lottery_code_id: lotteryCodeRecord.id,
            prize_id: selectedPrize ? selectedPrize.id : null,
            is_winner: isWinner,
            ip_address: req.ip,
            user_agent: req.get('User-Agent'),
          },
          manager,
        )

        // 准备响应数据
        const responseData: Record<string, unknown> = {
          is_winner: isWinner,
          lottery_record: {
            id: lotteryRecord.id,
            created_at: lotteryRecord.created_at,
          },
          lottery_code: {
            code: lotteryCodeRecord.code,
            participant_info: lotteryCodeRecord.participant_info || {},
          },
        }

        if (isWinner && selectedPrize) {
          responseData.prize = {
            id: selectedPrize.id,
            name: selectedPrize.name,
            description: selectedPrize.description,
          }
        }

        return { responseData, message: isWinner ? '恭喜您中奖了！' : '很遗憾，您没有中奖' }
      })

      res.json({
        success: true,
        data: responseData,
        message,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * @route   POST /api/lottery/activities/:id/undo-draw
 * @desc    撤销一次抽奖（签字完成前）：中奖恢复奖品库存、抽奖码置回未使用、删除本次记录。
 *          线上抽奖无登录态，凭「记录 id + 本次抽奖码」作为归属凭证（与抽奖本身同信任级）；
 *          测试码抽奖无副作用，直接返回成功。
 * @access  Public（受全局 /lottery 限流）
 */
router.post(
  '/activities/:id/undo-draw',
  [
    body('record_id').isInt({ min: 1 }).withMessage('记录ID必须是正整数'),
    body('lottery_code').notEmpty().withMessage('抽奖码不能为空'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array(),
        })
      }

      const activityId = parseInt(req.params.id)
      const { record_id, lottery_code: lotteryCode } = req.body

      const record = await AppDataSource.getRepository(LotteryRecord).findOne({
        where: { id: record_id },
        relations: { activity: true, prize: true, lotteryCode: true },
      })
      if (!record || record.activity_id !== activityId) {
        throw createError('BUSINESS_LOTTERY_RECORD_NOT_FOUND', '抽奖记录不存在')
      }

      // 归属凭证：撤销者必须持有本次抽奖码（与抽奖入口同信任级）
      if (!record.lotteryCode || record.lotteryCode.code !== lotteryCode.trim()) {
        throw createError('AUTH_INSUFFICIENT_PERMISSION', '抽奖码与本次记录不匹配')
      }

      // 测试码抽奖：无库存/状态副作用，直接成功（测试码与测试记录保留复用）
      if (record.is_test) {
        return res.json({
          success: true,
          data: { restored: true, is_test: true },
          message: '测试抽奖无实际副作用',
        })
      }

      // 签字是最终确认：已签字的记录不可撤销
      if (record.signature_status === 'signed') {
        throw createError('BUSINESS_SIGNATURE_EXISTS', '已签字确认的抽奖不可撤销')
      }

      await AppDataSource.transaction(async (manager) => {
        // 中奖恢复库存（未中奖无奖品可恢复）
        if (record.is_winner && record.prize_id) {
          await PrizeService.restoreStock(record.prize!, 1, manager)
        }
        // 抽奖码置回未使用（可再次参与）
        await LotteryCodeService.markAsUnused(record.lotteryCode!, manager)
        // 删除本次记录
        await manager.getRepository(LotteryRecord).remove(record)
      })

      await writeOperationLog({
        user_id: record.operator_id ?? null,
        operation_type: 'UNDO_LOTTERY_DRAW',
        operation_detail: `撤销抽奖：${lotteryCode}${record.is_winner && record.prize ? `（恢复库存：${record.prize.name}）` : ''}`,
        target_type: 'ACTIVITY',
        target_id: activityId,
        ip_address: req.ip,
        user_agent: req.get('User-Agent') || null,
      })

      res.json({
        success: true,
        data: { restored: true, is_test: false },
        message: record.is_winner
          ? '已撤销本次抽奖，奖品库存已恢复'
          : '已撤销本次抽奖，抽奖码已恢复可用',
      })
    } catch (error) {
      next(error)
    }
  },
)

// ==================== 邮箱即抽（无预输入抽奖码） ====================

// 前缀合法字符（本地部分子集）：字母/数字/点/下划线/连字符
const EMAIL_PREFIX_RE = /^[A-Za-z0-9._-]{1,64}$/

interface EmailDrawSettings {
  enabled?: boolean
  domain_suffix?: string
  max_per_email?: number
  /** 点击链接设备是否直接显示结果（默认 true；false=仅确认，回原提交页查看） */
  show_result_on_click?: boolean
}

const getEmailDrawSettings = (activity: Activity): EmailDrawSettings => {
  const raw = (activity.settings as Record<string, unknown> | null)?.email_draw
  return raw && typeof raw === 'object' ? (raw as EmailDrawSettings) : {}
}

/** 该邮箱在活动下的全部业务码（participant_info.email 精确匹配） */
const findEmailCodes = (activityId: number, email: string): Promise<LotteryCode[]> =>
  AppDataSource.getRepository(LotteryCode)
    .createQueryBuilder('code')
    .where('code.activity_id = :activityId', { activityId })
    .andWhere('code.is_test = false')
    .andWhere(`code.participant_info->>'email' = :email`, { email })
    .orderBy('code.created_at', 'ASC')
    .getMany()

/**
 * @route   POST /api/lottery/activities/:id/email-draw/request
 * @desc    邮箱即抽：提交邮箱前缀 → 生成（或复用待用）抽奖码并发确认邮件；
 *          参与者点击邮件链接（?edraw=code）后才真正执行抽奖
 * @access  Public（/lottery 全局限流 + 每邮箱 1/min、10/day 发送频控）
 */
router.post(
  '/activities/:id/email-draw/request',
  [body('email_prefix').notEmpty().withMessage('邮箱前缀不能为空')],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array(),
        })
      }

      const activityId = parseInt(req.params.id)
      const prefix = String(req.body.email_prefix || '')
        .trim()
        .toLowerCase()

      const activity = await ActivityService.findById(activityId)
      if (!activity) throw createError('BUSINESS_ACTIVITY_NOT_FOUND')

      const emailDraw = getEmailDrawSettings(activity)
      if (emailDraw.enabled !== true) {
        throw createError('VALIDATION_INVALID_FORMAT', '该活动未开启邮箱即抽')
      }
      const suffix = emailDraw.domain_suffix || ''
      if (!suffix.startsWith('@')) {
        throw createError('SYSTEM_MAIL_NOT_CONFIGURED', '活动邮箱后缀未配置')
      }
      if (!EMAIL_PREFIX_RE.test(prefix)) {
        throw createError(
          'VALIDATION_INVALID_FORMAT',
          '邮箱前缀仅支持字母、数字、点、下划线、连字符',
        )
      }
      const email = `${prefix}${suffix.toLowerCase()}`

      // 活动须在进行中（与真实码抽奖一致）
      const openState = ActivityService.getActivityOpenState(activity)
      if (!openState.open) {
        throw createError('BUSINESS_ACTIVITY_NOT_STARTED', openState.message || '活动不可参与')
      }

      // 参与上限优先于频控：已达上限的邮箱应听到「达上限」而非「太频繁」
      const maxPerEmail = emailDraw.max_per_email || 1
      const codes = await findEmailCodes(activityId, email)
      const usedCount = codes.filter((c) => c.status === 'used').length
      if (usedCount >= maxPerEmail) {
        throw createError('VALIDATION_OUT_OF_RANGE', `该邮箱参与次数已达上限（${maxPerEmail} 次）`)
      }

      // 每邮箱发送频控（幂等重发同样计入，防邮件轰炸）
      const limit = await checkEmailDrawSendLimit(email)
      if (!limit.allowed) {
        throw createError('AUTH_TOO_MANY_REQUESTS', limit.message || '发送过于频繁')
      }

      let lotteryCode = codes.find((c) => c.status === 'unused')

      if (!lotteryCode) {
        // 生成新码（占用活动码配额；撞码重试）
        const settings = (activity.settings as Record<string, unknown>) || {}
        const format = (settings.lottery_code_format as string) || '8_digit_number'
        const maxLotteryCodes = (settings.max_lottery_codes as number) || 1000
        const existingCount = await LotteryCodeService.countByActivity(activityId)
        if (existingCount + 1 > maxLotteryCodes) {
          throw createError(
            'VALIDATION_OUT_OF_RANGE',
            `参与人数将达到活动最大抽奖码限制 ${maxLotteryCodes}`,
          )
        }
        const existingCodes = await LotteryCodeService.getAllCodesForActivity(activityId)
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = generateLotteryCode(format)
          if (!existingCodes.includes(candidate)) {
            lotteryCode = await AppDataSource.getRepository(LotteryCode).save({
              activity_id: activityId,
              code: candidate,
              participant_info: { email },
              status: 'unused',
            })
            break
          }
        }
        if (!lotteryCode) {
          throw createError('SYSTEM_INTERNAL_ERROR', '生成抽奖码失败，请重试')
        }
      }

      // 确认邮件（点击链接 → /lottery?activityId=&edraw=code → 前端用公开 draw 端点执行抽奖）
      const mailConfig = await MailService.getMailConfig()
      if (!mailConfig?.postUrl) {
        throw createError('SYSTEM_MAIL_NOT_CONFIGURED', '邮件通道未配置，请联系管理员')
      }
      // 前端地址取提交页来源（Origin/Referer 即抽奖页），兜底请求主机
      const frontendBase =
        req.get('origin') ||
        (req.get('referer') ? new URL(req.get('referer')!).origin : undefined) ||
        `${req.protocol}://${req.get('host')}`
      const link = `${frontendBase}/lottery?activityId=${activityId}&edraw=${lotteryCode.code}`

      await MailService.sendMail(mailConfig, {
        to: email,
        subject: `抽奖参与确认：「${activity.name}」`,
        body: await renderEmailDrawMail(activity.name, link),
        html: true,
      })

      await writeOperationLog({
        user_id: null,
        operation_type: OPERATION_TYPES.EMAIL_DRAW_REQUEST,
        operation_detail: `邮箱即抽请求: ${email}（码 ${lotteryCode.code}）`,
        target_type: 'ACTIVITY',
        target_id: activityId,
        ip_address: req.ip,
        user_agent: req.get('User-Agent') || null,
      })

      res.status(200).json({
        success: true,
        data: { sent: true, email },
        message: `确认邮件已发送至 ${email}，请在邮箱中点击链接完成抽奖`,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * @route   GET /api/lottery/activities/:id/email-draw/status
 * @desc    邮箱即抽状态（供提交页长轮询）：none / pending / drawn（drawn 附结果摘要；
 *          不含抽奖码——邮箱可被他人枚举，码仅随邮件发给本人，点击设备方可撤销）
 * @access  Public（wait=1 时最长挂 20s，每秒查库，状态变化即返）
 */
router.get('/activities/:id/email-draw/status', async (req, res, next) => {
  try {
    const activityId = parseInt(req.params.id)
    const email = String(req.query.email || '')
      .trim()
      .toLowerCase()
    const wait = req.query.wait === '1'

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw createError('VALIDATION_INVALID_FORMAT', '邮箱格式不正确')
    }

    // 长轮询：pending 时最多挂 20 秒等待点击设备完成抽奖
    const deadline = Date.now() + 20_000
    while (true) {
      const codes = await findEmailCodes(activityId, email)
      const drawnCode = codes.find((c) => c.status === 'used')
      if (drawnCode) {
        const record = await AppDataSource.getRepository(LotteryRecord).findOne({
          where: { lottery_code_id: drawnCode.id, is_test: false },
          relations: { prize: true },
          order: { created_at: 'DESC' },
        })
        return res.json({
          success: true,
          data: {
            state: 'drawn',
            result: record
              ? {
                  is_winner: record.is_winner,
                  prize: record.prize
                    ? { name: record.prize.name, description: record.prize.description }
                    : null,
                  created_at: record.created_at,
                }
              : { is_winner: false, prize: null, created_at: null },
          },
        })
      }

      // 长轮询：wait=1 且存在待用请求（pending）时挂起等点击设备完成抽奖；
      // none（无请求，如邮箱拼错）与超时立即返回当前状态
      const hasPending = codes.some((c) => c.status === 'unused')
      if (!wait || !hasPending || Date.now() >= deadline) {
        return res.json({
          success: true,
          data: { state: codes.length > 0 ? 'pending' : 'none' },
        })
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  } catch (error) {
    next(error)
  }
})

/**
 * @route   POST /api/lottery/activities/:id/offline-draw
 * @desc    管理员使用抽奖码进行线下抽奖
 * @access  Private (Admin)
 */
router.post(
  '/activities/:id/offline-draw',
  [
    authenticateToken,
    requireAdmin,

    body('lottery_code').notEmpty().withMessage('抽奖码不能为空'),

    body('prize_id').optional().isInt({ min: 1 }).withMessage('奖品ID必须是正整数'),
  ],
  validateRequest,
  logLotteryDraw(OPERATION_TYPES.OFFLINE_LOTTERY),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const activityId = req.params.id
      const { lottery_code, prize_id } = req.body

      const { responseData, message } = await AppDataSource.transaction(async (manager) => {
        // 查找活动
        const activity = await manager
          .getRepository(Activity)
          .findOneBy({ id: parseInt(activityId) })
        if (!activity) {
          throw createError('BUSINESS_ACTIVITY_NOT_FOUND')
        }

        // 检查用户权限
        if (
          (req as any).user.role !== 'super_admin' &&
          activity.created_by !== (req as any).user.id
        ) {
          throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能管理自己创建的活动')
        }

        // 查找抽奖码
        const lotteryCodeRecord = await LotteryCodeService.findByActivityAndCode(
          parseInt(activityId),
          lottery_code,
          manager,
        )
        if (!lotteryCodeRecord) {
          throw createError('BUSINESS_LOTTERY_CODE_NOT_FOUND', '抽奖码不存在或不属于此活动')
        }

        // 测试抽奖码短路：同线上 draw——置于状态/时间检查之前（无视活动起止与状态），
        // 指定 prize_id 时照常校验但不扣库存；写 is_test 测试记录（带 operator_id 可走签字）
        if (lotteryCodeRecord.is_test) {
          let demoPrize: Prize | null = null
          if (prize_id) {
            const prize = await manager.getRepository(Prize).findOneBy({ id: parseInt(prize_id) })
            if (!prize || prize.activity_id !== parseInt(activityId)) {
              throw createError('VALIDATION_INVALID_FORMAT', '奖品不存在或不属于此活动')
            }
            if (prize.remaining_quantity <= 0) {
              throw createError('BUSINESS_PRIZE_OUT_OF_STOCK')
            }
            demoPrize = prize
          } else {
            demoPrize = await PrizeService.selectByProbability(parseInt(activityId), activity, {
              manager,
            })
          }
          const demoRecord = await LotteryRecordService.upsertDemoRecord(
            {
              activity_id: parseInt(activityId),
              lottery_code_id: lotteryCodeRecord.id,
              prize_id: demoPrize ? demoPrize.id : null,
              is_winner: !!demoPrize,
              operator_id: (req as any).user.id,
              ip_address: req.ip,
              user_agent: req.get('User-Agent'),
            },
            manager,
          )
          const demoData: Record<string, unknown> = {
            is_winner: !!demoPrize,
            is_demo: true,
            lottery_record: {
              id: demoRecord.id,
              created_at: demoRecord.created_at,
            },
            lottery_code: {
              code: lotteryCodeRecord.code,
              participant_info: lotteryCodeRecord.participant_info || {},
            },
          }
          if (demoPrize) {
            demoData.prize = {
              id: demoPrize.id,
              name: demoPrize.name,
              description: demoPrize.description,
            }
          }
          return {
            responseData: demoData,
            message: demoPrize ? '恭喜您中奖了！' : '很遗憾，您没有中奖',
          }
        }

        // 状态/时间校验（真实码路径）：与线上 draw 统一（此前线下完全不查）
        const offlineCanStart = ActivityService.canStartLottery(activity)
        if (!offlineCanStart.canStart) {
          throw createError('BUSINESS_ACTIVITY_NOT_STARTED', offlineCanStart.reason)
        }

        // 检查抽奖码是否已使用
        if (lotteryCodeRecord.status === 'used') {
          throw createError('BUSINESS_LOTTERY_CODE_USED')
        }

        // 检查是否已经抽过奖
        const existingRecord = await manager.getRepository(LotteryRecord).findOneBy({
          lottery_code_id: lotteryCodeRecord.id,
        } as any)

        if (existingRecord) {
          throw createError('BUSINESS_LOTTERY_CODE_USED', '该抽奖码已参与过抽奖')
        }

        let isWinner = false
        let selectedPrize: Prize | null = null

        // 如果指定了奖品ID，使用指定奖品
        if (prize_id) {
          const prize = await manager.getRepository(Prize).findOneBy({ id: parseInt(prize_id) })
          if (!prize || prize.activity_id !== parseInt(activityId)) {
            throw createError('VALIDATION_INVALID_FORMAT', '奖品不存在或不属于此活动')
          }

          if (prize.remaining_quantity <= 0) {
            throw createError('BUSINESS_PRIZE_OUT_OF_STOCK')
          }

          isWinner = true
          selectedPrize = prize
          await PrizeService.deductStock(selectedPrize, 1, manager)
        } else {
          // 使用概率抽奖
          const selectedPrizeRecord = await PrizeService.selectByProbability(
            parseInt(activityId),
            activity,
            { manager },
          )

          if (selectedPrizeRecord && selectedPrizeRecord.remaining_quantity > 0) {
            isWinner = true
            selectedPrize = selectedPrizeRecord
            await PrizeService.deductStock(selectedPrize, 1, manager)
          } else {
            isWinner = false
            selectedPrize = null
          }
        }

        // 标记抽奖码为已使用
        await LotteryCodeService.markAsUsed(lotteryCodeRecord, manager)

        // 创建抽奖记录
        const lotteryRecord = await LotteryRecordService.createRecord(
          {
            activity_id: parseInt(activityId),
            lottery_code_id: lotteryCodeRecord.id,
            prize_id: selectedPrize ? selectedPrize.id : null,
            is_winner: isWinner,
            operator_id: (req as any).user.id,
            ip_address: req.ip,
            user_agent: req.get('User-Agent'),
          },
          manager,
        )

        // 准备响应数据
        const responseData: Record<string, unknown> = {
          is_winner: isWinner,
          lottery_record: {
            id: lotteryRecord.id,
            created_at: lotteryRecord.created_at,
          },
          lottery_code: {
            code: lotteryCodeRecord.code,
            participant_info: lotteryCodeRecord.participant_info || {},
          },
        }

        if (isWinner && selectedPrize) {
          responseData.prize = {
            id: selectedPrize.id,
            name: selectedPrize.name,
            description: selectedPrize.description,
          }
        }

        return { responseData, message: isWinner ? '抽奖成功，参与者中奖！' : '很遗憾未中奖' }
      })

      res.json({
        success: true,
        data: responseData,
        message,
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * @route   POST /api/lottery/activities/:id/records/:recordId/signature
 * @desc    上传签字图片（PNG data URL 直接存库）
 * @access  Private (Admin)
 */
router.post(
  '/activities/:id/records/:recordId/signature',
  [
    authenticateToken,
    requireAdmin,
    body('image')
      .notEmpty()
      .withMessage('签字图片不能为空')
      .isString()
      // MIME 白名单：签字板输出 PNG；拒绝任意 data:* 类型入库（曾接受任意 MIME）
      .matches(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
      .withMessage('签字图片必须是base64字符串'),
  ],
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const activityId = parseInt(req.params.id)
      const recordId = parseInt(req.params.recordId)
      const { image } = req.body

      // 查找活动
      const activity = await ActivityService.findById(activityId)
      if (!activity) {
        throw createError('BUSINESS_ACTIVITY_NOT_FOUND')
      }

      // 检查用户权限
      if (
        (req as any).user.role !== 'super_admin' &&
        activity.created_by !== (req as any).user.id
      ) {
        throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能管理自己创建的活动')
      }

      // 查找抽奖记录
      const record = await LotteryRecordService.findById(recordId)
      if (!record) {
        throw createError('BUSINESS_LOTTERY_RECORD_NOT_FOUND', '抽奖记录不存在')
      }

      // 校验记录属于该活动
      if (record.activity_id !== activityId) {
        throw createError('VALIDATION_INVALID_FORMAT', '该记录不属于此活动')
      }

      // 校验是线下抽奖记录（有operator_id）
      if (!record.operator_id) {
        throw createError('VALIDATION_INVALID_FORMAT', '仅线下抽奖记录支持签字')
      }

      // 校验已经签过字
      if (record.signature_status === 'signed') {
        throw createError('BUSINESS_SIGNATURE_EXISTS', '该记录已签字，不可重复签字')
      }

      // 规范为完整 data URL（前端可能传裸 base64 或 data URL）
      const dataUrl = image.startsWith('data:')
        ? image
        : `data:image/png;base64,${image.replace(/^data:image\/png;base64,/, '')}`

      // 限制大小（解码后 2MB）
      const MAX_SIZE = 2 * 1024 * 1024
      const base64Payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
      if (Buffer.from(base64Payload, 'base64').length > MAX_SIZE) {
        throw createError('VALIDATION_FILE_TOO_LARGE', '签字图片大小不能超过2MB')
      }

      // 直接存库（signed_at/signature_status 由服务层维护）
      await LotteryRecordService.updateSignature(recordId, {
        signature_data: dataUrl,
        signed_at: new Date(),
      })

      res.json({
        success: true,
        data: {
          record_id: recordId,
          signature_data: dataUrl,
          signed_at: new Date().toISOString(),
        },
        message: '签字上传成功',
      })
    } catch (error) {
      next(error)
    }
  },
)

/**
 * @route   GET /api/lottery/activities/:id/records/:recordId/signature
 * @desc    获取签字图片（data URL；列表接口不返回此大字段）
 * @access  Private (Admin)
 */
router.get(
  '/activities/:id/records/:recordId/signature',
  [authenticateToken, requireAdmin],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const activityId = parseInt(req.params.id)
      const recordId = parseInt(req.params.recordId)

      const activity = await ActivityService.findById(activityId)
      if (!activity) {
        throw createError('BUSINESS_ACTIVITY_NOT_FOUND')
      }

      if (
        (req as any).user.role !== 'super_admin' &&
        activity.created_by !== (req as any).user.id
      ) {
        throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能管理自己创建的活动')
      }

      const record = await LotteryRecordService.findById(recordId)
      if (!record) {
        throw createError('BUSINESS_LOTTERY_RECORD_NOT_FOUND', '抽奖记录不存在')
      }
      if (record.activity_id !== activityId) {
        throw createError('VALIDATION_INVALID_FORMAT', '该记录不属于此活动')
      }

      res.json({
        success: true,
        data: {
          record_id: recordId,
          signature_status: record.signature_status,
          signature_data: record.signature_data,
          signed_at: record.signed_at,
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

export default router
