import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../utils/database';
import { LotteryRecord } from '../entities/lottery-record.entity';

const managerOf = (manager?: EntityManager): DataSource | EntityManager => manager ?? AppDataSource;

export interface CreateRecordData {
  activity_id: number;
  lottery_code_id: number;
  prize_id?: number | null;
  is_winner?: boolean;
  operator_id?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

// 原createRecord
export function createRecord(
  data: CreateRecordData,
  manager?: EntityManager,
): Promise<LotteryRecord> {
  const {
    activity_id,
    lottery_code_id,
    prize_id = null,
    is_winner = false,
    operator_id = null,
    ip_address = null,
    user_agent = null,
  } = data;

  return managerOf(manager).getRepository(LotteryRecord).save({
    activity_id,
    lottery_code_id,
    prize_id,
    is_winner,
    operator_id,
    ip_address,
    user_agent,
  });
}

// 原updateSignature
export async function updateSignature(
  recordId: number,
  signatureData: {
    signature_data: string;
    signed_at?: Date;
  },
  manager?: EntityManager,
): Promise<LotteryRecord | null> {
  const repo = managerOf(manager).getRepository(LotteryRecord);
  const record = await repo.findOneBy({ id: recordId });
  if (!record) {
    return null;
  }

  record.signature_data = signatureData.signature_data;
  record.signed_at = signatureData.signed_at || new Date();
  record.signature_status = 'signed';

  return repo.save(record);
}

// 列表场景剥离大字段：签字 data URL 只通过专用取图接口返回
export function stripSignatureData(records: LotteryRecord[]): LotteryRecord[] {
  for (const r of records) {
    delete r.signature_data;
  }
  return records;
}

export const findById = (id: number, manager?: EntityManager): Promise<LotteryRecord | null> =>
  managerOf(manager).getRepository(LotteryRecord).findOneBy({ id });

/**
 * 原findByActivity：分页联查 lotteryCode/prize/activity/operator。
 * 原实现的JSON_EXTRACT字面量改为 participant_info->>'x' ILIKE 参数化。
 */
export async function findByActivity(
  activityId: number,
  options: {
    page?: number;
    limit?: number;
    winner_only?: boolean;
    participant_name?: string;
    lottery_code?: string;
    keyword?: string;
    start_date?: string;
    end_date?: string;
  } = {},
): Promise<Record<string, unknown>> {
  const {
    page = 1,
    limit = 20,
    winner_only = false,
    participant_name,
    lottery_code,
    keyword,
    start_date,
    end_date,
  } = options;
  const offset = (page - 1) * limit;

  const qb = AppDataSource.getRepository(LotteryRecord)
    .createQueryBuilder('record')
    .leftJoinAndSelect('record.lotteryCode', 'lotteryCode')
    .leftJoinAndSelect('record.prize', 'prize')
    .leftJoinAndSelect('record.activity', 'activity')
    .leftJoinAndSelect('record.operator', 'operator')
    .where('record.activity_id = :activityId', { activityId });

  if (winner_only) {
    qb.andWhere('record.is_winner = :isWinner', { isWinner: true });
  }

  if (start_date) {
    qb.andWhere('record.created_at >= :startDate', { startDate: new Date(start_date) });
  }

  if (end_date) {
    qb.andWhere('record.created_at <= :endDate', { endDate: new Date(end_date) });
  }

  // 参与者姓名搜索
  if (participant_name) {
    qb.andWhere(`lotteryCode.participant_info->>'name' ILIKE :participantName`, {
      participantName: `%${participant_name}%`,
    });
  }

  // 抽奖码搜索
  if (lottery_code) {
    qb.andWhere('lotteryCode.code ILIKE :lotteryCode', { lotteryCode: `%${lottery_code}%` });
  }

  // 关键词搜索
  if (keyword) {
    qb.andWhere(
      `(lotteryCode.code ILIKE :keyword
        OR lotteryCode.participant_info->>'name' ILIKE :keyword
        OR lotteryCode.participant_info->>'phone' ILIKE :keyword
        OR lotteryCode.participant_info->>'email' ILIKE :keyword)`,
      { keyword: `%${keyword}%` },
    );
  }

  qb.orderBy('record.created_at', 'DESC').skip(offset).take(limit);

  const [rows, count] = await qb.getManyAndCount();

  return {
    records: stripSignatureData(rows),
    pagination: {
      total: count,
      page: parseInt(String(page)),
      limit: parseInt(String(limit)),
      totalPages: Math.ceil(count / limit),
    },
  };
}

// 原findByOperator
export async function findByOperator(
  operatorId: number,
  options: { page?: number; limit?: number; activity_id?: number } = {},
): Promise<Record<string, unknown>> {
  const { page = 1, limit = 20, activity_id } = options;
  const offset = (page - 1) * limit;

  const qb = AppDataSource.getRepository(LotteryRecord)
    .createQueryBuilder('record')
    .leftJoinAndSelect('record.lotteryCode', 'lotteryCode')
    .leftJoinAndSelect('record.prize', 'prize')
    .leftJoinAndSelect('record.activity', 'activity')
    .where('record.operator_id = :operatorId', { operatorId });

  if (activity_id) {
    qb.andWhere('record.activity_id = :activityId', { activityId: activity_id });
  }

  qb.orderBy('record.created_at', 'DESC').skip(offset).take(limit);

  const [rows, count] = await qb.getManyAndCount();

  return {
    records: stripSignatureData(rows),
    pagination: {
      total: count,
      page: parseInt(String(page)),
      limit: parseInt(String(limit)),
      totalPages: Math.ceil(count / limit),
    },
  };
}

/**
 * 原getWinningStatistics：按奖品/按日期分组统计。
 * MySQL的fn('DATE')改为PG的 created_at::date。
 */
export async function getWinningStatistics(
  activityId: number,
  options: { start_date?: string; end_date?: string } = {},
): Promise<Record<string, unknown>> {
  const { start_date, end_date } = options;

  const repo = AppDataSource.getRepository(LotteryRecord);

  // 按奖品分组统计（联奖品名）
  const prizeStats = await repo
    .createQueryBuilder('record')
    .innerJoinAndSelect('record.prize', 'prize')
    .where('record.activity_id = :activityId', { activityId })
    .andWhere('record.is_winner = :isWinner', { isWinner: true })
    .andWhere(start_date ? 'record.created_at >= :startDate' : '1=1', {
      ...(start_date ? { startDate: new Date(start_date) } : {}),
    })
    .andWhere(end_date ? 'record.created_at <= :endDate' : '1=1', {
      ...(end_date ? { endDate: new Date(end_date) } : {}),
    })
    .select('record.prize_id', 'prize_id')
    .addSelect('prize.name', 'prize_name')
    .addSelect('COUNT(*)', 'count')
    .groupBy('record.prize_id')
    .addGroupBy('prize.name')
    .getRawMany();

  // 按日期分组统计（MySQL fn('DATE') → PG ::date）
  const dailyStats = await repo
    .createQueryBuilder('record')
    .where('record.activity_id = :activityId', { activityId })
    .andWhere('record.is_winner = :isWinner', { isWinner: true })
    .andWhere(start_date ? 'record.created_at >= :startDate' : '1=1', {
      ...(start_date ? { startDate: new Date(start_date) } : {}),
    })
    .andWhere(end_date ? 'record.created_at <= :endDate' : '1=1', {
      ...(end_date ? { endDate: new Date(end_date) } : {}),
    })
    .select(`record.created_at::date`, 'date')
    .addSelect('COUNT(*)', 'count')
    .groupBy(`record.created_at::date`)
    .orderBy(`record.created_at::date`, 'ASC')
    .getRawMany();

  const totalWinners = await repo.countBy({ activity_id: activityId, is_winner: true });

  return {
    total_winners: totalWinners,
    prize_statistics: prizeStats,
    daily_statistics: dailyStats,
  };
}

export function getTotalRecords(activityId: number): Promise<number> {
  return AppDataSource.getRepository(LotteryRecord).countBy({ activity_id: activityId });
}

export function getTotalWinners(activityId: number): Promise<number> {
  return AppDataSource.getRepository(LotteryRecord).countBy({
    activity_id: activityId,
    is_winner: true,
  });
}

// 原hasDrawn
export async function hasDrawn(lotteryCodeId: number): Promise<boolean> {
  const record = await AppDataSource
    .getRepository(LotteryRecord)
    .findOne({ where: { lottery_code_id: lotteryCodeId } });
  return !!record;
}
