import { EntityManager } from 'typeorm'
import { AppDataSource } from '../utils/database'
import { AuditLog, AuditAction } from '../entities/audit-log.entity'
import { Prize } from '../entities/prize.entity'

/** 动作枚举值列表（路由校验与前端选项对齐用） */
export const AUDIT_ACTIONS = [
  'DRAW_ONLINE',
  'DRAW_OFFLINE',
  'DRAW_TEST',
  'UNDO_DRAW',
  'RECORD_DELETE',
  'PRIZE_CREATE',
  'PRIZE_UPDATE',
  'PRIZE_DELETE',
  'CODE_CREATE',
  'CODE_IMPORT',
  'CODE_REPLACE',
  'CODE_DELETE',
] as const

const managerOf = (manager?: EntityManager) => manager ?? AppDataSource

export interface AuditEntry {
  activity_id: number
  action: AuditAction
  lottery_code?: string | null
  prize_name?: string | null
  quantity_before?: number | null
  quantity_after?: number | null
  /** 码类动作（quantity 为空）显式给码量净变化；库存类自动按前后差计算 */
  delta?: number
  actor_type?: 'admin' | 'participant' | 'email' | 'system'
  actor?: string | null
  user_id?: number | null
  is_test?: boolean
  ip_address?: string | null
  user_agent?: string | null
  detail?: string | null
  prize_description?: string | null
  prize_id?: number | null
}

/**
 * 写一条审计记录。manager 可选——在库存/码量变动的事务内传入同一 manager，
 * 保证审计与业务变更原子提交；事务外的管理端操作省略即可。
 * 审计写入失败不应阻断业务：事务内抛错由外层回滚（合理，审计与变更一致）；
 * 事务外调用方自行决定是否捕获。
 */
export async function record(entry: AuditEntry, manager?: EntityManager): Promise<AuditLog> {
  const quantityBefore = entry.quantity_before ?? null
  const quantityAfter = entry.quantity_after ?? null
  const delta =
    quantityBefore !== null && quantityAfter !== null
      ? quantityAfter - quantityBefore
      : (entry.delta ?? 0)

  // 奖品描述/ID 快照：随名一并留存（奖品删除后审计仍可读，ID 是稳定指针）。
  // 调用方未显式提供时按 activity+name 就地补查（同一 manager，事务内一致；
  // 同名奖品会任取一条——各调用点尽量显式传，这里只是兜底）
  let prizeDescription = entry.prize_description ?? null
  let prizeId = entry.prize_id ?? null
  if ((!prizeDescription || !prizeId) && entry.prize_name) {
    const prize = await managerOf(manager)
      .getRepository(Prize)
      .findOneBy({ activity_id: entry.activity_id, name: entry.prize_name })
    prizeDescription = prizeDescription ?? prize?.description ?? null
    prizeId = prizeId ?? prize?.id ?? null
  }

  return managerOf(manager)
    .getRepository(AuditLog)
    .save({
      activity_id: entry.activity_id,
      action: entry.action,
      lottery_code: entry.lottery_code ?? null,
      prize_name: entry.prize_name ?? null,
      prize_description: prizeDescription,
      prize_id: prizeId,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      delta,
      actor_type: entry.actor_type ?? 'system',
      actor: entry.actor ?? null,
      user_id: entry.user_id ?? null,
      is_test: entry.is_test === true,
      ip_address: entry.ip_address ?? null,
      user_agent: entry.user_agent ?? null,
      detail: entry.detail ?? null,
    })
}

export interface AuditFilters {
  activity_id?: number
  action?: string
  code?: string
  start_date?: string
  end_date?: string
  page?: number
  limit?: number
}

/**
 * 分页查询（管理端审计页）。属主过滤：非超管仅见自己创建的活动
 * （join activities.created_by，与 admin/lottery-record 的域过滤一致）。
 */
export async function findPaginated(
  filters: AuditFilters,
  requester: { id: number; role: string },
): Promise<{
  logs: AuditLog[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}> {
  const { activity_id, action, code, start_date, end_date } = filters
  const page = Math.max(1, filters.page || 1)
  const limit = Math.min(100, Math.max(1, filters.limit || 20))

  const qb = AppDataSource.getRepository(AuditLog)
    .createQueryBuilder('audit')
    .innerJoin('audit.activity', 'activity')
    .addSelect('activity.name', 'activity_name')
  // 属主过滤：普通管理员仅自己的活动
  if (requester.role !== 'super_admin') {
    qb.andWhere('activity.created_by = :ownerId', { ownerId: requester.id })
  }
  if (activity_id) qb.andWhere('audit.activity_id = :activityId', { activity_id })
  if (action) qb.andWhere('audit.action = :action', { action })
  if (code) qb.andWhere('audit.lottery_code ILIKE :code', { code: `%${code}%` })
  if (start_date) qb.andWhere('audit.created_at >= :startDate', { startDate: new Date(start_date) })
  if (end_date)
    qb.andWhere('audit.created_at <= :endDate', { endDate: new Date(`${end_date}T23:59:59`) })

  qb.orderBy('audit.created_at', 'DESC')
    .skip((page - 1) * limit)
    .take(limit)

  const [rows, count] = await qb.getManyAndCount()
  return {
    logs: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  }
}
