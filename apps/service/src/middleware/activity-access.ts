import { Request } from 'express'
import { createError } from '../utils/custom-error'
import * as ActivityService from '../services/activity.service'
import * as LotteryRecordService from '../services/lottery-record.service'
import { Activity } from '../entities/activity.entity'
import { LotteryRecord } from '../entities/lottery-record.entity'

/**
 * 活动属主校验（admin 资源的统一授权规则）：
 * 超级管理员放行；普通管理员仅能访问自己创建的活动（含其派生资源）。
 * 原 admin/activities.ts 内联实现提取至此，供活动、抽奖码、抽奖记录等路由共用。
 */
export const requireActivityAccess = async (
  activityId: string | number,
  req: Request,
): Promise<Activity> => {
  const activity = await ActivityService.findById(Number(activityId))
  if (!activity) {
    throw createError('BUSINESS_ACTIVITY_NOT_FOUND')
  }

  if ((req as any).user.role !== 'super_admin' && activity.created_by !== (req as any).user.id) {
    throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能访问自己创建的活动')
  }

  return activity
}

/**
 * 抽奖记录属主校验：记录 → 所属活动 → created_by（超级管理员放行）。
 * 补齐 admin/lottery-record 路由的 IDOR（记录含参与者 PII）。
 */
export const requireRecordAccess = async (
  recordId: string | number,
  req: Request,
): Promise<LotteryRecord> => {
  const record = await LotteryRecordService.findById(Number(recordId))
  if (!record) {
    throw createError('BUSINESS_LOTTERY_RECORD_NOT_FOUND')
  }

  // 记录无 activity_id 时无法归属（理论上不该发生），按无权处理
  const activity = await ActivityService.findById(record.activity_id)
  if (
    !activity ||
    ((req as any).user.role !== 'super_admin' && activity.created_by !== (req as any).user.id)
  ) {
    throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能访问自己创建的活动')
  }

  return record
}
