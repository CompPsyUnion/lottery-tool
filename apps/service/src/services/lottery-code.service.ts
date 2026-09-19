import { DataSource, EntityManager, In } from 'typeorm'
import { AppDataSource } from '../utils/database'
import { LotteryCode, ParticipantInfo } from '../entities/lottery-code.entity'
import { LotteryRecord } from '../entities/lottery-record.entity'
import { Activity } from '../entities/activity.entity'
import { createError } from '../utils/custom-error'
import {
  generateLotteryCode,
  getFormatDescription,
  validateLotteryCodeFormat,
} from '../utils/lottery-code-generator'

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
// manager 可选：事务内取删后口径（导入覆盖的配额检查）
export const countByActivity = (
  activityId: number,
  status?: string,
  manager?: EntityManager,
): Promise<number> => {
  const repo = managerOf(manager).getRepository(LotteryCode)
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
export interface PagedLotteryCodes {
  lottery_codes: LotteryCode[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

export async function findByActivity(
  activityId: number,
  options: {
    page?: number
    limit?: number
    search?: string
    status?: string
    has_participant_info?: boolean
  } = {},
): Promise<PagedLotteryCodes> {
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

// ==================== 批量管理（导入 / 覆盖 / 批量删除） ====================

// 基础格式校验（与前端 CSV 解析器保持一致；宽松收集行错误而非拦截整批）
const MOBILE_RE = /^1[3-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ImportRowInput {
  code: string
  name?: string
  phone?: string
  email?: string
}

export type ImportRowAction = 'created' | 'updated' | 'failed'

export interface ImportRowResult {
  row: number
  code: string
  action: ImportRowAction
  reason?: string
}

export interface ImportLotteryCodesResult {
  mode: 'upsert' | 'replace'
  created: ImportRowResult[]
  updated: ImportRowResult[]
  failed: ImportRowResult[]
  /** replace 模式删除的 unused+invalid 业务码数量 */
  deleted_count: number
  /** 随码删除级联清除的抽奖记录数（FK ON DELETE CASCADE） */
  records_deleted: number
}

/**
 * 批量导入（upsert）/ 覆盖（replace）。
 * upsert：同码更新参与者信息（空列保留旧值，不清 kdocs 写入字段），新码创建，不删任何码。
 * replace：先删全部 unused+invalid 业务码（保留 used 与测试码），再按 upsert 写入。
 * 逐行校验失败收集为 failed 行（不拦截整批）；配额为活动级不变量，超限整批回滚。
 */
export async function importLotteryCodes(
  activity: Activity,
  rows: ImportRowInput[],
  mode: 'upsert' | 'replace' = 'upsert',
): Promise<ImportLotteryCodesResult> {
  const settings = (activity.settings || {}) as Record<string, unknown>
  const format = (settings.lottery_code_format as string) || '8_digit_number'
  const maxLotteryCodes = (settings.max_lottery_codes as number) || 1000

  // 第一遍：清洗 + 逐行校验；文件内同码 last-wins（后行视为修正）
  const failed: ImportRowResult[] = []
  const valid = new Map<string, { row: number; data: ImportRowInput }>()
  rows.forEach((raw, index) => {
    const row = index + 1
    const code = raw?.code !== undefined && raw?.code !== null ? String(raw.code).trim() : ''
    const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
    const phone = typeof raw?.phone === 'string' ? raw.phone.trim() : ''
    const email = typeof raw?.email === 'string' ? raw.email.trim() : ''

    if (!code) {
      failed.push({ row, code: '', action: 'failed', reason: '缺少抽奖码' })
      return
    }
    if (code.length > 50) {
      failed.push({ row, code, action: 'failed', reason: '抽奖码超过50字符' })
      return
    }
    if (!validateLotteryCodeFormat(code, format)) {
      failed.push({
        row,
        code,
        action: 'failed',
        reason: `不符合活动码格式（${getFormatDescription(format)}）`,
      })
      return
    }
    if (name.length > 100) {
      failed.push({ row, code, action: 'failed', reason: '姓名超过100字符' })
      return
    }
    if (phone && !MOBILE_RE.test(phone)) {
      failed.push({ row, code, action: 'failed', reason: '手机号格式不正确' })
      return
    }
    if (email && !EMAIL_RE.test(email)) {
      failed.push({ row, code, action: 'failed', reason: '邮箱格式不正确' })
      return
    }

    valid.set(code, {
      row,
      data: { code, name: name || undefined, phone: phone || undefined, email: email || undefined },
    })
  })

  return AppDataSource.transaction(async (manager) => {
    // 活动行悲观锁：同活动并发导入/覆盖串行化，配额判定不竞态
    await manager
      .getRepository(Activity)
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where('a.id = :id', { id: activity.id })
      .getOne()

    let deletedCount = 0
    let recordsDeleted = 0

    if (mode === 'replace') {
      const business = await manager.getRepository(LotteryCode).find({
        where: { activity_id: activity.id, is_test: false },
      })
      const doomed = business.filter((c) => c.status === 'unused' || c.status === 'invalid')
      if (doomed.length > 0) {
        const doomedIds = doomed.map((c) => c.id)
        const counts = await countRecordsByCodeIds(doomedIds, manager)
        recordsDeleted = [...counts.values()].reduce((sum, n) => sum + n, 0)
        await manager.getRepository(LotteryCode).delete(doomedIds)
        deletedCount = doomed.length
      }
    }

    // 已存在（replace 后幸存的 used 码同样可被更新信息）
    const codes = [...valid.keys()]
    const existing = codes.length
      ? await manager.getRepository(LotteryCode).find({
          where: { activity_id: activity.id, code: In(codes) },
        })
      : []
    const existingMap = new Map(existing.map((c) => [c.code, c]))

    // 配额一票否决（事务内取删后口径；超限抛错整体回滚，杜绝半写）
    const currentCount = await countByActivity(activity.id, undefined, manager)
    const createCount = [...valid.keys()].filter((code) => !existingMap.has(code)).length
    if (currentCount + createCount > maxLotteryCodes) {
      throw createError(
        'VALIDATION_OUT_OF_RANGE',
        `导入后将超过活动最大抽奖码限制 ${maxLotteryCodes}（当前 ${currentCount}，本次新增 ${createCount}）`,
      )
    }

    const created: ImportRowResult[] = []
    const updated: ImportRowResult[] = []

    for (const [code, { row, data }] of valid) {
      const exist = existingMap.get(code)
      if (exist) {
        // 非破坏合并：CSV 空列保留旧值（清空须走编辑弹窗），不动 status/used_at
        const merged: ParticipantInfo = { ...(exist.participant_info || {}) }
        if (data.name) merged.name = data.name
        if (data.phone) merged.phone = data.phone
        if (data.email) merged.email = data.email
        exist.participant_info = merged
        await manager.getRepository(LotteryCode).save(exist)
        updated.push({ row, code, action: 'updated' })
        continue
      }

      const info: ParticipantInfo | null =
        data.name || data.phone || data.email
          ? {
              ...(data.name ? { name: data.name } : {}),
              ...(data.phone ? { phone: data.phone } : {}),
              ...(data.email ? { email: data.email } : {}),
            }
          : null
      try {
        // 逐行插入以捕获唯一索引竞态并定位到行（批插无法定位失败行）
        await manager.getRepository(LotteryCode).insert({
          activity_id: activity.id,
          code,
          participant_info: info,
          status: 'unused',
        })
        created.push({ row, code, action: 'created' })
      } catch (e) {
        if ((e as { code?: string }).code === '23505') {
          failed.push({ row, code, action: 'failed', reason: '并发冲突：该抽奖码刚刚被创建' })
        } else {
          throw e
        }
      }
    }

    return {
      mode,
      created,
      updated,
      failed,
      deleted_count: deletedCount,
      records_deleted: recordsDeleted,
    }
  })
}

export interface DeleteCodesByIdsResult {
  deleted: Array<{ id: number; code: string; status: LotteryCode['status'] }>
  /** 不属于本活动的 id（含越权探测，无信息泄露） */
  not_found: number[]
  /** 防御性跳过的测试码 id */
  test_skipped: number[]
  /** 随码级联删除的抽奖记录数 */
  records_deleted: number
}

/**
 * 按 id 批量删除（活动域内）。允许删已使用码——其抽奖记录被 FK 级联删除，
 * 调用方（路由/前端确认弹窗）必须明示该副作用；测试码恒不删。
 */
export async function deleteCodesByIds(
  activityId: number,
  ids: number[],
): Promise<DeleteCodesByIdsResult> {
  const found = await AppDataSource.getRepository(LotteryCode).find({
    where: { id: In(ids), activity_id: activityId },
  })
  const foundIds = new Set(found.map((c) => c.id))
  const notFound = ids.filter((id) => !foundIds.has(id))
  const targets = found.filter((c) => !c.is_test)
  const testSkipped = found.filter((c) => c.is_test).map((c) => c.id)

  let recordsDeleted = 0
  if (targets.length > 0) {
    const counts = await countRecordsByCodeIds(targets.map((c) => c.id))
    recordsDeleted = [...counts.values()].reduce((sum, n) => sum + n, 0)
    await AppDataSource.getRepository(LotteryCode).delete(targets.map((c) => c.id))
  }

  return {
    deleted: targets.map((c) => ({ id: c.id, code: c.code, status: c.status })),
    not_found: notFound,
    test_skipped: testSkipped,
    records_deleted: recordsDeleted,
  }
}

/** 各码的抽奖记录数（管理列表附带展示/删除警示用），一次分组查询 */
export async function countRecordsByCodeIds(
  codeIds: number[],
  manager?: EntityManager,
): Promise<Map<number, number>> {
  if (codeIds.length === 0) return new Map()
  const rows: Array<{ lottery_code_id: string; count: string }> = await managerOf(manager)
    .getRepository(LotteryRecord)
    .createQueryBuilder('record')
    .select('record.lottery_code_id', 'lottery_code_id')
    .addSelect('COUNT(*)', 'count')
    .where('record.lottery_code_id IN (:...ids)', { ids: codeIds })
    .groupBy('record.lottery_code_id')
    .getRawMany()
  return new Map(rows.map((r) => [Number(r.lottery_code_id), Number(r.count)]))
}
