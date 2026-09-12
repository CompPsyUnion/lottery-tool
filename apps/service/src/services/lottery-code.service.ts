import { DataSource, EntityManager, In } from 'typeorm';
import { AppDataSource } from '../utils/database';
import { LotteryCode, ParticipantInfo } from '../entities/lottery-code.entity';

const managerOf = (manager?: EntityManager): DataSource | EntityManager => manager ?? AppDataSource;

export const findByActivityAndCode = (
  activityId: number,
  code: string,
  manager?: EntityManager,
): Promise<LotteryCode | null> =>
  managerOf(manager).getRepository(LotteryCode).findOneBy({ activity_id: activityId, code });

export const findById = (id: number, manager?: EntityManager): Promise<LotteryCode | null> =>
  managerOf(manager).getRepository(LotteryCode).findOneBy({ id });

export const countByActivity = (
  activityId: number,
  status?: string,
): Promise<number> => {
  const repo = AppDataSource.getRepository(LotteryCode);
  if (status) {
    return repo.countBy({ activity_id: activityId, status: status as LotteryCode['status'] });
  }
  return repo.countBy({ activity_id: activityId });
};

/**
 * 原findByActivity：分页 + 搜索。
 * 原实现用MySQL JSON_EXTRACT字面量拼接（有注入风险）；PG下改为
 * participant_info->>'name' ILIKE 参数化查询。
 */
export async function findByActivity(
  activityId: number,
  options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    has_participant_info?: boolean;
  } = {},
): Promise<Record<string, unknown>> {
  const { page = 1, limit = 20, search, status, has_participant_info } = options;
  const offset = (page - 1) * limit;

  const qb = AppDataSource.getRepository(LotteryCode)
    .createQueryBuilder('lottery_code')
    .where('lottery_code.activity_id = :activityId', { activityId });

  if (status) {
    qb.andWhere('lottery_code.status = :status', { status });
  }

  if (has_participant_info !== undefined) {
    if (has_participant_info) {
      qb.andWhere('lottery_code.participant_info IS NOT NULL');
    } else {
      qb.andWhere('lottery_code.participant_info IS NULL');
    }
  }

  if (search) {
    qb.andWhere(
      `(lottery_code.code ILIKE :search
        OR lottery_code.participant_info->>'name' ILIKE :search
        OR lottery_code.participant_info->>'phone' ILIKE :search
        OR lottery_code.participant_info->>'email' ILIKE :search)`,
      { search: `%${search}%` },
    );
  }

  qb.orderBy('lottery_code.created_at', 'DESC').skip(offset).take(limit);

  const [rows, count] = await qb.getManyAndCount();

  return {
    lottery_codes: rows,
    pagination: {
      total: count,
      page: parseInt(String(page)),
      limit: parseInt(String(limit)),
      totalPages: Math.ceil(count / limit),
    },
  };
}

// 原createBatch：批量创建抽奖码
export function createBatch(
  activityId: number,
  codes: string[],
  participantInfoList: (ParticipantInfo | null)[] = [],
  manager?: EntityManager,
): Promise<LotteryCode[]> {
  const rows = codes.map((code, index) =>
    managerOf(manager).getRepository(LotteryCode).create({
      activity_id: activityId,
      code,
      participant_info: participantInfoList[index] || null,
      status: 'unused' as const,
    }),
  );
  return managerOf(manager).getRepository(LotteryCode).save(rows);
}

// 原checkDuplicates：返回已存在的码
export async function checkDuplicates(
  activityId: number,
  codes: string[],
): Promise<string[]> {
  if (codes.length === 0) return [];
  const existing = await AppDataSource.getRepository(LotteryCode).find({
    where: { activity_id: activityId, code: In(codes) },
    select: { code: true },
  });
  return existing.map((item) => item.code);
}

export function getUsedCodes(activityId: number): Promise<LotteryCode[]> {
  return AppDataSource.getRepository(LotteryCode).find({
    where: { activity_id: activityId, status: 'used' },
    order: { used_at: 'DESC' },
  });
}

// 原getStatistics
export async function getStatistics(activityId: number): Promise<Record<string, unknown>> {
  const [totalCount, usedCount] = await Promise.all([
    countByActivity(activityId),
    countByActivity(activityId, 'used'),
  ]);

  const unusedCount = totalCount - usedCount;
  const usageRate = totalCount > 0 ? ((usedCount / totalCount) * 100).toFixed(2) : '0.00';

  return {
    total_count: totalCount,
    used_count: usedCount,
    unused_count: unusedCount,
    usage_rate: usageRate,
  };
}

// 原getAllCodesForActivity（用于去重检查）
export async function getAllCodesForActivity(activityId: number): Promise<string[]> {
  const codes = await AppDataSource.getRepository(LotteryCode).find({
    where: { activity_id: activityId },
    select: { code: true },
  });
  return codes.map((item) => item.code);
}

// 原markAsUsed实例方法（原beforeUpdate钩子补写used_at的逻辑显式化）
export async function markAsUsed(
  lotteryCode: LotteryCode,
  manager?: EntityManager,
): Promise<LotteryCode> {
  if (lotteryCode.status === 'used') {
    throw new Error('抽奖码已经使用过了');
  }

  lotteryCode.status = 'used';
  lotteryCode.used_at = new Date();
  return managerOf(manager).getRepository(LotteryCode).save(lotteryCode);
}

export async function markAsUnused(
  lotteryCode: LotteryCode,
  manager?: EntityManager,
): Promise<LotteryCode> {
  lotteryCode.status = 'unused';
  lotteryCode.used_at = null;
  return managerOf(manager).getRepository(LotteryCode).save(lotteryCode);
}

export async function markAsInvalid(
  lotteryCode: LotteryCode,
  manager?: EntityManager,
): Promise<LotteryCode> {
  if (lotteryCode.status === 'invalid') {
    throw new Error('抽奖码已经作废了');
  }

  lotteryCode.status = 'invalid';
  return managerOf(manager).getRepository(LotteryCode).save(lotteryCode);
}

export async function updateParticipantInfo(
  lotteryCode: LotteryCode,
  participantInfo: ParticipantInfo,
  manager?: EntityManager,
): Promise<LotteryCode> {
  lotteryCode.participant_info = participantInfo;
  return managerOf(manager).getRepository(LotteryCode).save(lotteryCode);
}
