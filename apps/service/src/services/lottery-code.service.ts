import { DataSource, EntityManager, In } from 'typeorm'
import { AppDataSource } from '../utils/database'
import { LotteryCode, ParticipantInfo } from '../entities/lottery-code.entity'
import { Activity } from '../entities/activity.entity'
import { generateLotteryCode } from '../utils/lottery-code-generator'

const managerOf = (manager?: EntityManager): DataSource | EntityManager => manager ?? AppDataSource

export const findByActivityAndCode = (
  activityId: number,
  code: string,
  manager?: EntityManager,
): Promise<LotteryCode | null> =>
  managerOf(manager).getRepository(LotteryCode).findOneBy({ activity_id: activityId, code })

export const findById = (id: number, manager?: EntityManager): Promise<LotteryCode | null> =>
  managerOf(manager).getRepository(LotteryCode).findOneBy({ id })

// 统计口径统一排除测试码（is_test）：计数、配额上限、使用率均按业务码语义
export const countByActivity = (activityId: number, status?: string): Promise<number> => {
  const repo = AppDataSource.getRepository(LotteryCode)
  if (status) {
    return repo.countBy({
      activity_id: activityId,
      status: status as LotteryCode['status'],
      is_test: false,
    })
  }
  return repo.countBy({ activity_id: activityId, is_test: false })
}

/**
 * 原findByActivity：分页 + 搜索。
 * 原实现用MySQL JSON_EXTRACT字面量拼接（有注入风险）；PG下改为
 * participant_info->>'name' ILIKE 参数化查询。
 */
export async function findByActivity(
  activityId: number,
  options: {
    page?: number
    limit?: number
    search?: string
    status?: string
    has_participant_info?: boolean
  } = {},
): Promise<Record<string, unknown>> {
  const { page = 1, limit = 20, search, status, has_participant_info } = options
  const offset = (page - 1) * limit

  const qb = AppDataSource.getRepository(LotteryCode)
    .createQueryBuilder('lottery_code')
    .where('lottery_code.activity_id = :activityId', { activityId })
    // 测试码不进管理端列表（唯一查看入口是活动列表的抽奖页面测试 Dialog）
    .andWhere('lottery_code.is_test = false')

  if (status) {
    qb.andWhere('lottery_code.status = :status', { status })
  }

  if (has_participant_info !== undefined) {
    if (has_participant_info) {
      qb.andWhere('lottery_code.participant_info IS NOT NULL')
    } else {
      qb.andWhere('lottery_code.participant_info IS NULL')
    }
  }

  if (search) {
    qb.andWhere(
      `(lottery_code.code ILIKE :search
        OR lottery_code.participant_info->>'name' ILIKE :search
        OR lottery_code.participant_info->>'phone' ILIKE :search
        OR lottery_code.participant_info->>'email' ILIKE :search)`,
      { search: `%${search}%` },
    )
  }

  qb.orderBy('lottery_code.created_at', 'DESC').skip(offset).take(limit)

  const [rows, count] = await qb.getManyAndCount()

  return {
    lottery_codes: rows,
    pagination: {
      total: count,
      page: parseInt(String(page)),
      limit: parseInt(String(limit)),
      totalPages: Math.ceil(count / limit),
    },
  }
}

// 原createBatch：批量创建抽奖码
export function createBatch(
  activityId: number,
  codes: string[],
  participantInfoList: (ParticipantInfo | null)[] = [],
  manager?: EntityManager,
): Promise<LotteryCode[]> {
  const rows = codes.map((code, index) =>
    managerOf(manager)
      .getRepository(LotteryCode)
      .create({
        activity_id: activityId,
        code,
        participant_info: participantInfoList[index] || null,
        status: 'unused' as const,
      }),
  )
  return managerOf(manager).getRepository(LotteryCode).save(rows)
}

/**
 * 幂等获取（或创建）活动的测试抽奖码：一活动至多一个（DB 部分唯一索引
 * uq_lottery_codes_activity_is_test 兜底）。已存在且被手动置为
 * used/invalid 时复位为 unused（测试码语义 = 永远可抽）。
 * 不受 settings.max_lottery_codes 配额约束（countByActivity 已排除测试码）。
 */
export async function ensureTestCode(activity: Activity): Promise<LotteryCode> {
  const repo = AppDataSource.getRepository(LotteryCode)

  const existing = await repo.findOneBy({ activity_id: activity.id, is_test: true })
  if (existing) {
    if (existing.status !== 'unused') return markAsUnused(existing)
    return existing
  }

  const format = activity.settings?.lottery_code_format || '8_digit_number'
  // 排除集包含测试码（getAllCodesForActivity 不过滤 is_test），避免新码与既有码碰撞
  const existingCodes = await getAllCodesForActivity(activity.id)

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateLotteryCode(format)
    if (existingCodes.includes(code)) continue
    try {
      return await repo.save(
        repo.create({ activity_id: activity.id, code, status: 'unused' as const, is_test: true }),
      )
    } catch (e) {
      const constraint = (e as { code?: string; constraint?: string; detail?: string }) ?? {}
      if (constraint.code === '23505') {
        if (String(constraint.constraint || constraint.detail || '').includes('activity_is_test')) {
          // 并发下别的请求已建了测试码：回查返回
          const winner = await repo.findOneBy({ activity_id: activity.id, is_test: true })
          if (winner) return winner
          continue
        }
        // 与业务码撞车：换码重试
        continue
      }
      throw e
    }
  }
  throw new Error('生成测试抽奖码失败，请重试')
}

// 原checkDuplicates：返回已存在的码
export async function checkDuplicates(activityId: number, codes: string[]): Promise<string[]> {
  if (codes.length === 0) return []
  const existing = await AppDataSource.getRepository(LotteryCode).find({
    where: { activity_id: activityId, code: In(codes) },
    select: { code: true },
  })
  return existing.map((item) => item.code)
}

export function getUsedCodes(activityId: number): Promise<LotteryCode[]> {
  return AppDataSource.getRepository(LotteryCode).find({
    where: { activity_id: activityId, status: 'used' },
    order: { used_at: 'DESC' },
  })
}

// 原getStatistics
export async function getStatistics(activityId: number): Promise<Record<string, unknown>> {
  const [totalCount, usedCount] = await Promise.all([
    countByActivity(activityId),
    countByActivity(activityId, 'used'),
  ])

  const unusedCount = totalCount - usedCount
  const usageRate = totalCount > 0 ? ((usedCount / totalCount) * 100).toFixed(2) : '0.00'

  return {
    total_count: totalCount,
    used_count: usedCount,
    unused_count: unusedCount,
    usage_rate: usageRate,
  }
}

// 原getAllCodesForActivity（用于去重检查）
export async function getAllCodesForActivity(activityId: number): Promise<string[]> {
  const codes = await AppDataSource.getRepository(LotteryCode).find({
    where: { activity_id: activityId },
    select: { code: true },
  })
  return codes.map((item) => item.code)
}

// 原markAsUsed实例方法（原beforeUpdate钩子补写used_at的逻辑显式化）
export async function markAsUsed(
  lotteryCode: LotteryCode,
  manager?: EntityManager,
): Promise<LotteryCode> {
  if (lotteryCode.status === 'used') {
    throw new Error('抽奖码已经使用过了')
  }

  lotteryCode.status = 'used'
  lotteryCode.used_at = new Date()
  return managerOf(manager).getRepository(LotteryCode).save(lotteryCode)
}

export async function markAsUnused(
  lotteryCode: LotteryCode,
  manager?: EntityManager,
): Promise<LotteryCode> {
  lotteryCode.status = 'unused'
  lotteryCode.used_at = null
  return managerOf(manager).getRepository(LotteryCode).save(lotteryCode)
}

export async function markAsInvalid(
  lotteryCode: LotteryCode,
  manager?: EntityManager,
): Promise<LotteryCode> {
  if (lotteryCode.status === 'invalid') {
    throw new Error('抽奖码已经作废了')
  }

  lotteryCode.status = 'invalid'
  return managerOf(manager).getRepository(LotteryCode).save(lotteryCode)
}

export async function updateParticipantInfo(
  lotteryCode: LotteryCode,
  participantInfo: ParticipantInfo,
  manager?: EntityManager,
): Promise<LotteryCode> {
  lotteryCode.participant_info = participantInfo
  return managerOf(manager).getRepository(LotteryCode).save(lotteryCode)
}
