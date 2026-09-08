/**
 * 活动状态定时流转（落库）：
 *   ① ready + (start_time IS NULL 或已到点) → active（无开始时间的 ready 立即开始）
 *   ② ready/active + end_time 已过 → ended
 * 两条 UPDATE 固定顺序执行——整个时间窗已过的 ready 在同一 tick 内先转 active 再落 ended。
 *
 * 单实例实现（与 email-code.service 的内存 Map 假设一致）：多实例部署会重复执行
 * 相同的幂等 UPDATE，无害但建议单实例运行。时区：timestamp 无时区列，写入与
 * 比较均走 pg 驱动同一序列化链路（服务器本地墙钟），自洽；运行中不要改服务器时区。
 */
import { AppDataSource } from '../utils/database'
import { Activity } from '../entities/activity.entity'
import logger from '../utils/logger'

const SCAN_INTERVAL_MS = 60_000

/** 执行一轮到期流转（bulk UPDATE，不逐行），返回 { toActive, toEnded } 影响行数 */
export async function transitionDueActivities(): Promise<{ toActive: number; toEnded: number }> {
  const now = new Date()

  const toActive = await AppDataSource.createQueryBuilder()
    .update(Activity)
    .set({ status: 'active', updated_at: now })
    .where("status = 'ready' AND (start_time IS NULL OR start_time <= :now)", { now })
    .execute()
    .then((r) => r.affected ?? 0)

  const toEnded = await AppDataSource.createQueryBuilder()
    .update(Activity)
    .set({ status: 'ended', updated_at: now })
    .where("status IN ('ready', 'active') AND end_time IS NOT NULL AND end_time <= :now", { now })
    .execute()
    .then((r) => r.affected ?? 0)

  return { toActive, toEnded }
}

let timer: ReturnType<typeof setInterval> | null = null

async function tick(): Promise<void> {
  if (!AppDataSource.isInitialized) return
  try {
    const { toActive, toEnded } = await transitionDueActivities()
    if (toActive > 0 || toEnded > 0) {
      logger.info(`[activity-status] 自动流转 · →active: ${toActive} · →ended: ${toEnded}`)
    }
  } catch (error) {
    // 单轮失败不影响下一轮：吞掉记日志，不让定时器抛出
    logger.error(`[activity-status] 流转失败: ${error instanceof Error ? error.message : error}`)
  }
}

/** 启动定时器：先立即执行一次（启动补扫，覆盖停机期间到点的活动），再每分钟一轮 */
export function startScheduler(): void {
  if (timer) return
  void tick()
  timer = setInterval(() => void tick(), SCAN_INTERVAL_MS)
}

/** 停止定时器（测试/关停用） */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
