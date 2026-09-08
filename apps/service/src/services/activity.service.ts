import crypto from 'crypto'
import { AppDataSource } from '../utils/database'
import { Activity, ActivitySettings, ActivityStatus } from '../entities/activity.entity'
import * as LotteryCodeService from './lottery-code.service'
import * as PrizeService from './prize.service'
import * as LotteryRecordService from './lottery-record.service'

// 原Activity beforeCreate钩子：webhook默认值 + settings默认值
export function applyCreateDefaults(activity: Partial<Activity>): Partial<Activity> {
  if (!activity.webhook_id) {
    activity.webhook_id = crypto.randomBytes(16).toString('hex')
  }
  if (!activity.webhook_token) {
    activity.webhook_token = crypto.randomBytes(32).toString('hex')
  }

  if (!activity.settings || Object.keys(activity.settings).length === 0) {
    activity.settings = {
      max_lottery_codes: 1000,
      lottery_code_format: '8_digit_number',
      allow_duplicate_phone: false,
      lottery_strategy: 'probability', // 'probability'(概率模式) 或 'guaranteed'(100%中奖模式)
      require_signature: false,
    }
  }

  if (!activity.settings.lottery_strategy) {
    activity.settings = { ...activity.settings, lottery_strategy: 'probability' }
  }

  return activity
}

export function createActivity(data: Partial<Activity>): Promise<Activity> {
  return AppDataSource.getRepository(Activity).save(applyCreateDefaults({ ...data }))
}

export const findById = (id: number): Promise<Activity | null> =>
  AppDataSource.getRepository(Activity).findOneBy({ id })

export const findByWebhookId = (webhookId: string): Promise<Activity | null> =>
  AppDataSource.getRepository(Activity).findOneBy({ webhook_id: webhookId })

// 状态机流转矩阵：draft→ready（发布）→active（手动立即开始/定时到点）→ended（手动/到点）；
// ready 可撤回 draft；active/ended 不可逆
const ALLOWED_TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  draft: ['ready'],
  ready: ['draft', 'active'],
  active: ['ended'],
  ended: [],
}

export function canTransition(from: ActivityStatus, to: ActivityStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) === true
}

export async function transitionStatus(activity: Activity, to: ActivityStatus): Promise<Activity> {
  if (!canTransition(activity.status, to)) {
    throw new Error(`不允许的状态流转: ${activity.status} → ${to}`)
  }
  return AppDataSource.getRepository(Activity).save({ ...activity, status: to })
}

/**
 * 共享的活动开放判定（null 安全）：ended → 已结束；draft/ready → 未开始；
 * 时间窗 null 视为不限制。canStartLottery 与抽奖码公开校验接口统一走此函数
 * （原三处内联实现不一致：lottery-code.ts 对 null end_time 恒判超时）。
 */
export function getActivityOpenState(
  activity: Activity,
  now: Date = new Date(),
): { open: boolean; message?: string } {
  if (activity.status === 'ended') return { open: false, message: '活动已结束' }
  if (activity.status === 'draft' || activity.status === 'ready') {
    return { open: false, message: '活动未开始' }
  }
  if (activity.start_time && now < activity.start_time) {
    return { open: false, message: '活动未开始' }
  }
  if (activity.end_time && now > activity.end_time) {
    return { open: false, message: '活动已结束' }
  }
  return { open: true }
}

// 原canStartLottery实例方法（薄包装，签名不变）
export function canStartLottery(activity: Activity): { canStart: boolean; reason?: string } {
  const { open, message } = getActivityOpenState(activity)
  return open ? { canStart: true } : { canStart: false, reason: message }
}

// 原getStatistics实例方法
export async function getStatistics(activityId: number): Promise<Record<string, unknown>> {
  const [totalLotteryCodes, usedLotteryCodes, totalRecords, totalWinners, prizes] =
    await Promise.all([
      LotteryCodeService.countByActivity(activityId),
      LotteryCodeService.countByActivity(activityId, 'used'),
      LotteryRecordService.getTotalRecords(activityId),
      LotteryRecordService.getTotalWinners(activityId),
      PrizeService.findByActivity(activityId),
    ])

  const remainingLotteryCodes = totalLotteryCodes - usedLotteryCodes
  const winRate = totalRecords > 0 ? ((totalWinners / totalRecords) * 100).toFixed(2) : '0.00'

  const prizeStatistics = prizes.map((prize) => ({
    id: prize.id,
    name: prize.name,
    total_quantity: prize.total_quantity,
    remaining_quantity: prize.remaining_quantity,
    awarded_count: prize.total_quantity - prize.remaining_quantity,
    award_rate:
      prize.total_quantity > 0
        ? (
            ((prize.total_quantity - prize.remaining_quantity) / prize.total_quantity) *
            100
          ).toFixed(2)
        : '0.00',
  }))

  return {
    lottery_codes_count: totalLotteryCodes,
    remaining_lottery_codes: remainingLotteryCodes,
    used_lottery_codes: usedLotteryCodes,
    total_lottery_codes: totalLotteryCodes,
    total_lottery_records: totalRecords,
    total_winners: totalWinners,
    win_rate: winRate,
    prize_statistics: prizeStatistics,
  }
}

export type { ActivitySettings }

// 原findByCreator：分页 + ILIKE搜索 + 每活动抽奖码统计
export async function findByCreator(
  userId: number,
  options: { page?: number; limit?: number; search?: string; status?: string } = {},
): Promise<Record<string, unknown>> {
  const { page = 1, limit = 10, search, status } = options
  const offset = (page - 1) * limit

  const qb = AppDataSource.getRepository(Activity)
    .createQueryBuilder('activity')
    .where('activity.created_by = :userId', { userId })

  if (search) {
    qb.andWhere('(activity.name ILIKE :search OR activity.description ILIKE :search)', {
      search: `%${search}%`,
    })
  }

  if (status) {
    qb.andWhere('activity.status = :status', { status })
  }

  qb.orderBy('activity.created_at', 'DESC').skip(offset).take(limit)

  const [rows, count] = await qb.getManyAndCount()

  // 为每个活动添加抽奖码统计信息
  const activitiesWithStats = await Promise.all(
    rows.map(async (activity) => {
      const activityData: Record<string, unknown> = { ...activity }

      const [totalLotteryCodes, usedLotteryCodes] = await Promise.all([
        LotteryCodeService.countByActivity(activity.id),
        LotteryCodeService.countByActivity(activity.id, 'used'),
      ])

      activityData.lottery_codes_count = totalLotteryCodes
      activityData.remaining_lottery_codes = totalLotteryCodes - usedLotteryCodes
      activityData.used_lottery_codes = usedLotteryCodes

      return activityData
    }),
  )

  return {
    activities: activitiesWithStats,
    pagination: {
      total: count,
      page: parseInt(String(page)),
      limit: parseInt(String(limit)),
      totalPages: Math.ceil(count / limit),
    },
  }
}

// 原regenerateWebhookToken实例方法
export async function regenerateWebhookToken(activityId: number): Promise<string | null> {
  const repo = AppDataSource.getRepository(Activity)
  const activity = await repo.findOneBy({ id: activityId })
  if (!activity) {
    return null
  }
  activity.webhook_token = crypto.randomBytes(32).toString('hex')
  await repo.save(activity)
  return activity.webhook_token
}
