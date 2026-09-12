import crypto from 'crypto';
import { AppDataSource } from '../utils/database';
import { Activity, ActivitySettings } from '../entities/activity.entity';
import * as LotteryCodeService from './lottery-code.service';
import * as PrizeService from './prize.service';
import * as LotteryRecordService from './lottery-record.service';

// 原Activity beforeCreate钩子：webhook默认值 + settings默认值
export function applyCreateDefaults(activity: Partial<Activity>): Partial<Activity> {
  if (!activity.webhook_id) {
    activity.webhook_id = crypto.randomBytes(16).toString('hex');
  }
  if (!activity.webhook_token) {
    activity.webhook_token = crypto.randomBytes(32).toString('hex');
  }

  if (!activity.settings || Object.keys(activity.settings).length === 0) {
    activity.settings = {
      max_lottery_codes: 1000,
      lottery_code_format: '8_digit_number',
      allow_duplicate_phone: false,
      lottery_strategy: 'probability', // 'probability'(概率模式) 或 'guaranteed'(100%中奖模式)
      require_signature: false,
    };
  }

  if (!activity.settings.lottery_strategy) {
    activity.settings = { ...activity.settings, lottery_strategy: 'probability' };
  }

  return activity;
}

export function createActivity(data: Partial<Activity>): Promise<Activity> {
  return AppDataSource.getRepository(Activity).save(applyCreateDefaults({ ...data }));
}

export const findById = (id: number): Promise<Activity | null> =>
  AppDataSource.getRepository(Activity).findOneBy({ id });

export const findByWebhookId = (webhookId: string): Promise<Activity | null> =>
  AppDataSource.getRepository(Activity).findOneBy({ webhook_id: webhookId });

// 原canStartLottery实例方法
export function canStartLottery(activity: Activity): { canStart: boolean; reason?: string } {
  const now = new Date();

  if (activity.status !== 'active') {
    return { canStart: false, reason: '活动未激活' };
  }

  if (activity.start_time && now < activity.start_time) {
    return { canStart: false, reason: '活动未开始' };
  }

  if (activity.end_time && now > activity.end_time) {
    return { canStart: false, reason: '活动已结束' };
  }

  return { canStart: true };
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
    ]);

  const remainingLotteryCodes = totalLotteryCodes - usedLotteryCodes;
  const winRate = totalRecords > 0 ? ((totalWinners / totalRecords) * 100).toFixed(2) : '0.00';

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
  }));

  return {
    lottery_codes_count: totalLotteryCodes,
    remaining_lottery_codes: remainingLotteryCodes,
    used_lottery_codes: usedLotteryCodes,
    total_lottery_codes: totalLotteryCodes,
    total_lottery_records: totalRecords,
    total_winners: totalWinners,
    win_rate: winRate,
    prize_statistics: prizeStatistics,
  };
}

export type { ActivitySettings };

// 原findByCreator：分页 + ILIKE搜索 + 每活动抽奖码统计
export async function findByCreator(
  userId: number,
  options: { page?: number; limit?: number; search?: string; status?: string } = {},
): Promise<Record<string, unknown>> {
  const { page = 1, limit = 10, search, status } = options;
  const offset = (page - 1) * limit;

  const qb = AppDataSource.getRepository(Activity)
    .createQueryBuilder('activity')
    .where('activity.created_by = :userId', { userId });

  if (search) {
    qb.andWhere('(activity.name ILIKE :search OR activity.description ILIKE :search)', {
      search: `%${search}%`,
    });
  }

  if (status) {
    qb.andWhere('activity.status = :status', { status });
  }

  qb.orderBy('activity.created_at', 'DESC').skip(offset).take(limit);

  const [rows, count] = await qb.getManyAndCount();

  // 为每个活动添加抽奖码统计信息
  const activitiesWithStats = await Promise.all(
    rows.map(async (activity) => {
      const activityData: Record<string, unknown> = { ...activity };

      const [totalLotteryCodes, usedLotteryCodes] = await Promise.all([
        LotteryCodeService.countByActivity(activity.id),
        LotteryCodeService.countByActivity(activity.id, 'used'),
      ]);

      activityData.lottery_codes_count = totalLotteryCodes;
      activityData.remaining_lottery_codes = totalLotteryCodes - usedLotteryCodes;
      activityData.used_lottery_codes = usedLotteryCodes;

      return activityData;
    }),
  );

  return {
    activities: activitiesWithStats,
    pagination: {
      total: count,
      page: parseInt(String(page)),
      limit: parseInt(String(limit)),
      totalPages: Math.ceil(count / limit),
    },
  };
}

// 原regenerateWebhookToken实例方法
export async function regenerateWebhookToken(activityId: number): Promise<string | null> {
  const repo = AppDataSource.getRepository(Activity);
  const activity = await repo.findOneBy({ id: activityId });
  if (!activity) {
    return null;
  }
  activity.webhook_token = crypto.randomBytes(32).toString('hex');
  await repo.save(activity);
  return activity.webhook_token;
}
