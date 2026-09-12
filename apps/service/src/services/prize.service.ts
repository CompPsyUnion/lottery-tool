import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../utils/database';
import { Prize } from '../entities/prize.entity';
import { Activity } from '../entities/activity.entity';

const managerOf = (manager?: EntityManager): DataSource | EntityManager => manager ?? AppDataSource;

// 原findByActivity
export function findByActivity(
  activityId: number,
  options: { includeEmpty?: boolean } = {},
): Promise<Prize[]> {
  const { includeEmpty = true } = options;

  const qb = AppDataSource.getRepository(Prize)
    .createQueryBuilder('prize')
    .where('prize.activity_id = :activityId', { activityId });

  if (!includeEmpty) {
    qb.andWhere('prize.remaining_quantity > 0');
  }

  return qb.orderBy('prize.sort_order', 'ASC').addOrderBy('prize.created_at', 'ASC').getMany();
}

/**
 * 概率总和校验（原beforeCreate/beforeUpdate钩子逻辑，服务层显式调用）。
 * excludeId 用于更新场景排除自身；candidateProbability 为待写入的概率。
 */
export async function validateProbabilities(
  activityId: number,
  options: {
    excludeId?: number;
    candidateProbability?: number;
    manager?: EntityManager;
  } = {},
): Promise<{ isValid: boolean; totalProbability: number; prizes: number }> {
  const { excludeId, candidateProbability, manager } = options;

  const qb = managerOf(manager)
    .getRepository(Prize)
    .createQueryBuilder('prize')
    .where('prize.activity_id = :activityId', { activityId });

  if (excludeId) {
    qb.andWhere('prize.id != :excludeId', { excludeId });
  }

  const prizes = await qb.getMany();

  const totalProbability =
    prizes.reduce((sum, prize) => {
      const p = parseFloat(String(prize.probability || 0));
      return sum + (isNaN(p) ? 0 : p);
    }, 0) + (candidateProbability ?? 0);

  return {
    isValid: totalProbability <= 1,
    totalProbability: parseFloat(totalProbability.toFixed(4)),
    prizes: prizes.length,
  };
}

// 创建奖品（原beforeCreate钩子：remaining默认=total + 概率校验）
export async function createPrize(
  data: Partial<Prize> & { activity_id: number; name: string; probability: string | number },
  manager?: EntityManager,
): Promise<Prize> {
  const probability = parseFloat(String(data.probability || 0));
  if (probability > 1) {
    throw new Error('奖品概率不能超过1');
  }

  const check = await validateProbabilities(data.activity_id, {
    candidateProbability: probability,
    manager,
  });
  if (!check.isValid) {
    throw new Error(`添加此奖品后，活动概率总和将超过1（当前总和：${check.totalProbability.toFixed(4)}）`);
  }

  return managerOf(manager).getRepository(Prize).save({
    ...data,
    probability: String(data.probability),
    remaining_quantity: data.remaining_quantity ?? data.total_quantity ?? 0,
  });
}

// 更新奖品（原beforeUpdate钩子：clamp库存 + 概率变化校验）
export async function updatePrize(
  prize: Prize,
  updates: Partial<Prize>,
  manager?: EntityManager,
): Promise<Prize> {
  const merged = { ...prize, ...updates };

  // 确保剩余数量不超过总数量
  if (merged.remaining_quantity > merged.total_quantity) {
    merged.remaining_quantity = merged.total_quantity;
  }

  // 如果概率发生变化，验证总和
  if (updates.probability !== undefined && String(updates.probability) !== String(prize.probability)) {
    const probability = parseFloat(String(merged.probability || 0));
    if (probability > 1) {
      throw new Error('奖品概率不能超过1');
    }

    const check = await validateProbabilities(prize.activity_id, {
      excludeId: prize.id,
      candidateProbability: probability,
      manager,
    });
    if (!check.isValid) {
      throw new Error(`修改此奖品概率后，活动概率总和将超过1（当前总和：${check.totalProbability.toFixed(4)}）`);
    }
  }

  return managerOf(manager).getRepository(Prize).save(merged);
}

// 原deductStock实例方法
export async function deductStock(
  prize: Prize,
  quantity: number = 1,
  manager?: EntityManager,
): Promise<number> {
  if (prize.remaining_quantity < quantity) {
    throw new Error('库存不足');
  }

  prize.remaining_quantity -= quantity;
  await managerOf(manager).getRepository(Prize).save(prize);

  return prize.remaining_quantity;
}

// 原restoreStock实例方法
export async function restoreStock(
  prize: Prize,
  quantity: number = 1,
  manager?: EntityManager,
): Promise<number> {
  const newQuantity = prize.remaining_quantity + quantity;

  if (newQuantity > prize.total_quantity) {
    throw new Error('恢复库存不能超过总数量');
  }

  prize.remaining_quantity = newQuantity;
  await managerOf(manager).getRepository(Prize).save(prize);

  return prize.remaining_quantity;
}

/**
 * 原selectByProbability：根据抽奖策略随机选择奖品。
 * prizes 可由调用方在事务内预先查出（修复原实现读在事务外的缺口）。
 */
export async function selectByProbability(
  activityId: number,
  activity: Activity | null = null,
  options: { manager?: EntityManager; prizes?: Prize[] } = {},
): Promise<Prize | null> {
  const { manager, prizes: givenPrizes } = options;

  let targetActivity = activity;
  if (!targetActivity) {
    targetActivity = await managerOf(manager).getRepository(Activity).findOneBy({ id: activityId });
    if (!targetActivity) {
      throw new Error('活动不存在');
    }
  }

  // 获取有库存的奖品
  const prizes =
    givenPrizes ??
    (await managerOf(manager)
      .getRepository(Prize)
      .createQueryBuilder('prize')
      .where('prize.activity_id = :activityId', { activityId })
      .andWhere('prize.remaining_quantity > 0')
      .orderBy('prize.sort_order', 'ASC')
      .getMany());

  if (prizes.length === 0) {
    return null; // 没有可用奖品
  }

  // 获取抽奖策略
  const lotteryStrategy = targetActivity.settings?.lottery_strategy || 'probability';

  if (lotteryStrategy === 'guaranteed') {
    // 100%中奖模式：根据奖品数量分配可能性
    const totalQuantity = prizes.reduce((sum, prize) => sum + prize.remaining_quantity, 0);

    if (totalQuantity === 0) {
      return null; // 没有库存
    }

    const random = Math.random() * totalQuantity;

    let currentWeight = 0;
    for (const prize of prizes) {
      currentWeight += prize.remaining_quantity;
      if (random <= currentWeight) {
        return prize;
      }
    }

    return prizes[prizes.length - 1];
  }

  // 概率模式：根据设置的概率选择奖品
  const explicitPrizes: Array<{ prize: Prize; probability: number }> = [];
  const zeroPrizes: Prize[] = [];
  let explicitTotal = 0;
  for (const prize of prizes) {
    const p = parseFloat(String(prize.probability || 0));
    if (p > 0) {
      explicitPrizes.push({ prize, probability: p });
      explicitTotal += p;
    } else {
      zeroPrizes.push(prize);
    }
  }

  if (explicitTotal > 1) {
    throw new Error('活动奖品概率总和超过1');
  }

  let effectiveEntries: Array<{ prize: Prize; probability: number }> = [];
  const remainder = 1 - explicitTotal;

  if (zeroPrizes.length > 0 && remainder > 0) {
    // 平分剩余概率时，按剩余库存权重分配
    const totalStock = zeroPrizes.reduce((sum, prize) => sum + prize.remaining_quantity, 0);
    if (totalStock > 0) {
      for (const prize of zeroPrizes) {
        const weight = prize.remaining_quantity / totalStock;
        effectiveEntries.push({ prize, probability: remainder * weight });
      }
    }
  }
  effectiveEntries = effectiveEntries.concat(explicitPrizes);

  let cumulative = 0;
  const cumulativeProbabilities = effectiveEntries.map((item) => {
    cumulative += item.probability;
    return { prize: item.prize, cumulativeProbability: cumulative };
  });

  const totalEffective = cumulative;
  const random = Math.random();

  // 如果随机数超过总有效概率，判定为未中奖
  if (random > totalEffective) {
    return null;
  }

  for (const item of cumulativeProbabilities) {
    if (random <= item.cumulativeProbability) {
      return item.prize;
    }
  }

  return null;
}
