import { LessThan } from 'typeorm';
import { AppDataSource } from '../utils/database';
import { OperationLog } from '../entities/operation-log.entity';
import { User } from '../entities/user.entity';

// 操作类型常量（原OperationLog.OPERATION_TYPES）
export const OPERATION_TYPES: Record<string, string> = {
  // 认证相关
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_REGISTER: 'USER_REGISTER',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',

  // 活动管理
  CREATE_ACTIVITY: 'CREATE_ACTIVITY',
  UPDATE_ACTIVITY: 'UPDATE_ACTIVITY',
  DELETE_ACTIVITY: 'DELETE_ACTIVITY',
  ACTIVATE_ACTIVITY: 'ACTIVATE_ACTIVITY',
  END_ACTIVITY: 'END_ACTIVITY',

  // 奖品管理
  CREATE_PRIZE: 'CREATE_PRIZE',
  UPDATE_PRIZE: 'UPDATE_PRIZE',
  DELETE_PRIZE: 'DELETE_PRIZE',

  // 抽奖码管理
  CREATE_LOTTERY_CODE: 'CREATE_LOTTERY_CODE',
  BATCH_CREATE_LOTTERY_CODE: 'BATCH_CREATE_LOTTERY_CODE',
  IMPORT_LOTTERY_CODE: 'IMPORT_LOTTERY_CODE',
  UPDATE_LOTTERY_CODE: 'UPDATE_LOTTERY_CODE',
  DELETE_LOTTERY_CODE: 'DELETE_LOTTERY_CODE',
  INVALIDATE_LOTTERY_CODE: 'INVALIDATE_LOTTERY_CODE',
  BATCH_INVALIDATE_LOTTERY_CODE: 'BATCH_INVALIDATE_LOTTERY_CODE',

  // 抽奖操作
  ONLINE_LOTTERY: 'ONLINE_LOTTERY',
  OFFLINE_LOTTERY: 'OFFLINE_LOTTERY',

  // 系统管理
  CREATE_USER: 'CREATE_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',
  SYSTEM_BACKUP: 'SYSTEM_BACKUP',
  SYSTEM_RESTORE: 'SYSTEM_RESTORE',

  // Webhook操作
  WEBHOOK_CREATE_LOTTERY_CODE: 'WEBHOOK_CREATE_LOTTERY_CODE',
};

export interface LogData {
  user_id: number | null;
  operation_type: string;
  operation_detail: string | null;
  target_type?: string | null;
  target_id?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

// 原log类方法
export function log(data: LogData): Promise<OperationLog> {
  const {
    user_id,
    operation_type,
    operation_detail,
    target_type = null,
    target_id = null,
    ip_address = null,
    user_agent = null,
  } = data;

  return AppDataSource.getRepository(OperationLog).save({
    user_id,
    operation_type,
    operation_detail,
    target_type,
    target_id,
    ip_address,
    user_agent,
  });
}

export function logUserLogin(
  userId: number,
  ipAddress: string,
  userAgent: string,
): Promise<OperationLog> {
  return log({
    user_id: userId,
    operation_type: OPERATION_TYPES.USER_LOGIN,
    operation_detail: '用户登录',
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

export function logUserLogout(
  userId: number,
  ipAddress: string,
  userAgent: string,
): Promise<OperationLog> {
  return log({
    user_id: userId,
    operation_type: OPERATION_TYPES.USER_LOGOUT,
    operation_detail: '用户登出',
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

export function logActivityOperation(
  operationType: string,
  userId: number,
  activityId: number,
  activityName: string,
  ipAddress: string,
  userAgent: string,
): Promise<OperationLog> {
  const operationDetails: Record<string, string> = {
    [OPERATION_TYPES.CREATE_ACTIVITY]: `创建活动: ${activityName}`,
    [OPERATION_TYPES.UPDATE_ACTIVITY]: `更新活动: ${activityName}`,
    [OPERATION_TYPES.DELETE_ACTIVITY]: `删除活动: ${activityName}`,
    [OPERATION_TYPES.ACTIVATE_ACTIVITY]: `激活活动: ${activityName}`,
    [OPERATION_TYPES.END_ACTIVITY]: `结束活动: ${activityName}`,
  };

  return log({
    user_id: userId,
    operation_type: operationType,
    operation_detail: operationDetails[operationType],
    target_type: 'ACTIVITY',
    target_id: activityId,
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

export function logLotteryOperation(
  operationType: string,
  userId: number,
  activityId: number,
  lotteryCodeId: number,
  prizeName: string | null,
  ipAddress: string,
  userAgent: string,
): Promise<OperationLog> {
  const isWinner = !!prizeName;
  const detail = isWinner
    ? `${operationType === OPERATION_TYPES.ONLINE_LOTTERY ? '线上' : '线下'}抽奖中奖: ${prizeName}`
    : `${operationType === OPERATION_TYPES.ONLINE_LOTTERY ? '线上' : '线下'}抽奖未中奖`;

  return log({
    user_id: userId,
    operation_type: operationType,
    operation_detail: detail,
    target_type: 'LOTTERY_RECORD',
    target_id: lotteryCodeId,
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

// 原getList：分页 + 联查操作人
export async function getList(
  options: {
    page?: number;
    limit?: number;
    user_id?: number;
    operation_type?: string;
    target_type?: string;
    start_date?: string;
    end_date?: string;
  } = {},
): Promise<Record<string, unknown>> {
  const { page = 1, limit = 20, user_id, operation_type, target_type, start_date, end_date } =
    options;
  const offset = (page - 1) * limit;

  const qb = AppDataSource.getRepository(OperationLog)
    .createQueryBuilder('log')
    // 只取操作人的 id/username/email（对应原include attributes），避免带出密码哈希
    .leftJoinAndMapOne('log.user', User, 'user', 'user.id = log.user_id')
    .addSelect(['user.id', 'user.username', 'user.email'])
    .where('1=1');

  if (user_id) {
    qb.andWhere('log.user_id = :userId', { userId: user_id });
  }
  if (operation_type) {
    qb.andWhere('log.operation_type = :operationType', { operationType: operation_type });
  }
  if (target_type) {
    qb.andWhere('log.target_type = :targetType', { targetType: target_type });
  }
  if (start_date) {
    qb.andWhere('log.created_at >= :startDate', { startDate: new Date(start_date) });
  }
  if (end_date) {
    qb.andWhere('log.created_at <= :endDate', { endDate: new Date(end_date) });
  }

  qb.orderBy('log.created_at', 'DESC').skip(offset).take(limit);

  const [rows, count] = await qb.getManyAndCount();

  return {
    logs: rows,
    pagination: {
      total: count,
      page: parseInt(String(page)),
      limit: parseInt(String(limit)),
      totalPages: Math.ceil(count / limit),
    },
  };
}

// 原getOperationTypeStatistics
export function getOperationTypeStatistics(): Promise<unknown[]> {
  return AppDataSource.getRepository(OperationLog)
    .createQueryBuilder('log')
    .select('log.operation_type', 'operation_type')
    .addSelect('COUNT(*)', 'count')
    .groupBy('log.operation_type')
    .orderBy('COUNT(*)', 'DESC')
    .getRawMany();
}

// 原cleanup
export async function cleanup(days: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const result = await AppDataSource.getRepository(OperationLog).delete({
    created_at: LessThan(cutoffDate),
  });
  return result.affected ?? 0;
}

// 原getUserStatistics（MySQL fn('DATE') → PG ::date）
export function getUserStatistics(userId: number, days: number = 30): Promise<unknown[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return AppDataSource.getRepository(OperationLog)
    .createQueryBuilder('log')
    .where('log.user_id = :userId', { userId })
    .andWhere('log.created_at >= :startDate', { startDate })
    .select('log.operation_type', 'operation_type')
    .addSelect('COUNT(*)', 'count')
    .addSelect('log.created_at::date', 'date')
    .groupBy('log.operation_type')
    .addGroupBy('log.created_at::date')
    .orderBy('date', 'ASC')
    .getRawMany();
}
