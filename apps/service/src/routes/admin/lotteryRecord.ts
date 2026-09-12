import express, { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { In, MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../utils/database';
import { LotteryRecord } from '../../entities/lottery-record.entity';
import * as PrizeService from '../../services/prize.service';
import * as LotteryCodeService from '../../services/lottery-code.service';
import * as OperationLogService from '../../services/operation-log.service';
import moment from 'moment';

const router = express.Router();

// 基础联查（活动/奖品/抽奖码/操作人），抽奖码的参与者信息在其JSON字段中
const baseQuery = () =>
  AppDataSource.getRepository(LotteryRecord)
    .createQueryBuilder('record')
    .leftJoinAndSelect('record.activity', 'activity')
    .leftJoinAndSelect('record.prize', 'prize')
    .leftJoinAndSelect('record.lotteryCode', 'lotteryCode')
    .leftJoinAndSelect('record.operator', 'operator');

// 应用公共筛选（draw_type 按是否有操作员派生，列本身不存在）
const applyFilters = (
  qb: any,
  filters: {
    activity_id?: string;
    prize_id?: string;
    lottery_code?: string;
    start_date?: string;
    end_date?: string;
    draw_type?: string;
  },
) => {
  if (filters.activity_id) {
    qb.andWhere('record.activity_id = :activityId', { activityId: parseInt(filters.activity_id) });
  }
  if (filters.prize_id) {
    qb.andWhere('record.prize_id = :prizeId', { prizeId: parseInt(filters.prize_id) });
  }
  if (filters.lottery_code) {
    qb.andWhere('lotteryCode.code ILIKE :lotteryCode', { lotteryCode: `%${filters.lottery_code}%` });
  }
  if (filters.draw_type === 'online') {
    qb.andWhere('record.operator_id IS NULL');
  } else if (filters.draw_type === 'offline') {
    qb.andWhere('record.operator_id IS NOT NULL');
  }
  if (filters.start_date) {
    qb.andWhere('record.created_at >= :startDate', { startDate: new Date(filters.start_date) });
  }
  if (filters.end_date) {
    qb.andWhere('record.created_at <= :endDate', { endDate: new Date(filters.end_date) });
  }
  return qb;
};

// 获取抽奖记录列表
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('activity_id').optional().isInt({ min: 1 }).withMessage('活动ID必须是正整数'),
  query('prize_id').optional().isInt({ min: 1 }).withMessage('奖品ID必须是正整数'),
  query('lottery_code').optional().isString().withMessage('抽奖码必须是字符串'),
  query('start_date').optional().isISO8601().withMessage('开始日期格式不正确'),
  query('end_date').optional().isISO8601().withMessage('结束日期格式不正确'),
  query('draw_type').optional().isIn(['online', 'offline']).withMessage('抽奖类型必须是online或offline')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      activity_id,
      prize_id,
      lottery_code,
      start_date,
      end_date,
      draw_type
    } = req.query as any;

    const offset = (page - 1) * limit;

    const [rows, count] = await applyFilters(baseQuery(), {
      activity_id,
      prize_id,
      lottery_code,
      start_date,
      end_date,
      draw_type,
    })
      .orderBy('record.created_at', 'DESC')
      .skip(Math.floor(offset))
      .take(parseInt(limit))
      .getManyAndCount();

    res.json({
      success: true,
      data: {
        records: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          total_pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// 导出抽奖记录（必须在 GET /:id 之前注册，否则被路径参数遮蔽）
router.get('/export/csv', [
  query('activity_id').optional().isInt({ min: 1 }).withMessage('活动ID必须是正整数'),
  query('start_date').optional().isISO8601().withMessage('开始日期格式不正确'),
  query('end_date').optional().isISO8601().withMessage('结束日期格式不正确'),
  query('draw_type').optional().isIn(['online', 'offline']).withMessage('抽奖类型必须是online或offline')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors: errors.array()
      });
    }

    const { activity_id, start_date, end_date, draw_type } = req.query as any;

    const records = await applyFilters(baseQuery(), {
      activity_id,
      start_date,
      end_date,
      draw_type,
    })
      .orderBy('record.created_at', 'DESC')
      .getMany();

    // 生成CSV内容
    const csvHeaders = [
      '记录ID',
      '活动名称',
      '抽奖码',
      '参与者姓名',
      '参与者邮箱',
      '参与者电话',
      '奖品名称',
      '抽奖类型',
      '抽奖操作人',
      '抽奖时间'
    ];

    const csvRows = records.map((record: any) => [
      record.id,
      record.activity?.name || '',
      record.lotteryCode?.code || '',
      record.lotteryCode?.participant_info?.name || '',
      record.lotteryCode?.participant_info?.email || '',
      record.lotteryCode?.participant_info?.phone || '',
      record.prize?.name || '',
      record.operator_id ? '线下抽奖' : '线上抽奖',
      record.operator?.username || '',
      moment(record.created_at).format('YYYY-MM-DD HH:mm:ss')
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map((field: any) => `"${field}"`).join(','))
      .join('\n');

    // 设置响应头
    const filename = `抽奖记录_${moment().format('YYYYMMDD_HHmmss')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // 记录操作日志
    await OperationLogService.log({
      user_id: (req as any).user.id,
      operation_type: 'EXPORT_LOTTERY_RECORDS',
      operation_detail: `导出抽奖记录 ${records.length} 条`,
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || null,
    });

    res.send(csvContent);
  } catch (error) {
    next(error);
  }
});

// 获取抽奖统计信息（同样必须在 GET /:id 之前注册）
router.get('/stats/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(LotteryRecord);

    const totalRecords = await repo.count();
    // draw_type 是派生值：无操作员为线上，有操作员为线下
    const onlineRecords = await repo.countBy({ operator_id: null } as any);
    const offlineRecords = totalRecords - onlineRecords;

    // 今日抽奖记录
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 本周抽奖记录
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // 本月抽奖记录
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayRecords, weekRecords, monthRecords] = await Promise.all([
      repo.count({ where: { created_at: MoreThanOrEqual(today) } }),
      repo.count({ where: { created_at: MoreThanOrEqual(weekStart) } }),
      repo.count({ where: { created_at: MoreThanOrEqual(monthStart) } }),
    ]);

    res.json({
      success: true,
      data: {
        total_records: totalRecords,
        online_records: onlineRecords,
        offline_records: offlineRecords,
        today_records: todayRecords,
        week_records: weekRecords,
        month_records: monthRecords
      }
    });
  } catch (error) {
    next(error);
  }
});

// 获取抽奖记录详情
router.get('/:id', [
  param('id').isInt({ min: 1 }).withMessage('记录ID必须是正整数')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const record = await baseQuery()
      .where('record.id = :id', { id: parseInt(id) })
      .getOne();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: '抽奖记录不存在'
      });
    }

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    next(error);
  }
});

// 批量删除抽奖记录（恢复库存/重置抽奖码/删除 在同一事务中）
router.delete('/', [
  body('ids').isArray({ min: 1 }).withMessage('必须提供要删除的记录ID数组'),
  body('ids.*').isInt({ min: 1 }).withMessage('记录ID必须是正整数')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors: errors.array()
      });
    }

    const { ids } = req.body;

    const records = await AppDataSource.getRepository(LotteryRecord).find({
      where: { id: In(ids) },
      relations: { prize: true, lotteryCode: true },
    });

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到要删除的抽奖记录'
      });
    }

    await AppDataSource.transaction(async (manager) => {
      for (const record of records) {
        // 恢复奖品库存
        if (record.prize) {
          await PrizeService.restoreStock(record.prize, 1, manager);
        }

        // 标记抽奖码为未使用
        if (record.lotteryCode) {
          await LotteryCodeService.markAsUnused(record.lotteryCode, manager);
        }
      }

      // 批量删除记录
      await manager.getRepository(LotteryRecord).remove(records);
    });

    // 记录操作日志
    await OperationLogService.log({
      user_id: (req as any).user.id,
      operation_type: 'BATCH_DELETE_LOTTERY_RECORDS',
      operation_detail: `批量删除抽奖记录 ${records.length} 条`,
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || null,
    });

    res.json({
      success: true,
      message: `成功删除 ${records.length} 条抽奖记录`
    });
  } catch (error) {
    next(error);
  }
});

// 删除抽奖记录（恢复库存/重置抽奖码/删除 在同一事务中）
router.delete('/:id', [
  param('id').isInt({ min: 1 }).withMessage('记录ID必须是正整数')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors: errors.array()
      });
    }

    const { id } = req.params;

    const record = await AppDataSource.getRepository(LotteryRecord).findOne({
      where: { id: parseInt(id) },
      relations: { activity: true, prize: true, lotteryCode: true },
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: '抽奖记录不存在'
      });
    }

    await AppDataSource.transaction(async (manager) => {
      // 恢复奖品库存
      if (record.prize) {
        await PrizeService.restoreStock(record.prize, 1, manager);
      }

      // 标记抽奖码为未使用
      if (record.lotteryCode) {
        await LotteryCodeService.markAsUnused(record.lotteryCode, manager);
      }

      // 删除记录
      await manager.getRepository(LotteryRecord).remove(record);
    });

    // 记录操作日志
    await OperationLogService.log({
      user_id: (req as any).user.id,
      operation_type: 'DELETE_LOTTERY_RECORD',
      operation_detail: `删除抽奖记录 #${id}`,
      target_type: 'LOTTERY_RECORD',
      target_id: parseInt(id),
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || null,
    });

    res.json({
      success: true,
      message: '抽奖记录删除成功'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
