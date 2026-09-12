import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { optionalAuth, authenticateToken, requireAdmin } from '../middleware/auth';
import { logLotteryDraw } from '../middleware/operationLogger';
import { createError } from '../utils/customError';
import { AppDataSource } from '../utils/database';
import { Activity } from '../entities/activity.entity';
import { LotteryRecord } from '../entities/lottery-record.entity';
import { Prize } from '../entities/prize.entity';
import * as ActivityService from '../services/activity.service';
import * as LotteryCodeService from '../services/lottery-code.service';
import * as PrizeService from '../services/prize.service';
import * as LotteryRecordService from '../services/lottery-record.service';
import { OPERATION_TYPES } from '../services/operation-log.service';

const router = express.Router();

// 验证请求参数的中间件
const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(createError('VALIDATION_INVALID_FORMAT', '请求参数验证失败', errors.array()));
  }
  next();
};

/**
 * @route   GET /api/lottery/activities/:id
 * @desc    获取活动的抽奖信息（公开接口）
 * @access  Public
 */
router.get('/activities/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;

    const activity = await ActivityService.findById(parseInt(activityId));

    if (!activity) {
      throw createError('BUSINESS_ACTIVITY_NOT_FOUND');
    }

    // 只返回公开信息（奖品按 sort_order 排序，只取公开字段）
    const [prizes, lotteryCodesCount] = await Promise.all([
      PrizeService.findByActivity(parseInt(activityId)),
      LotteryCodeService.countByActivity(parseInt(activityId)),
    ]);

    res.json({
      success: true,
      data: {
        activity: {
          id: activity.id,
          name: activity.name,
          description: activity.description,
          status: activity.status,
          lottery_mode: activity.lottery_mode,
          start_time: activity.start_time,
          end_time: activity.end_time,
          settings: {
            require_signature: activity.settings?.require_signature === true
          }
        },
        prizes: prizes.map((prize) => ({
          id: prize.id,
          name: prize.name,
          description: prize.description,
          total_quantity: prize.total_quantity
        })),
        lottery_codes_count: lotteryCodesCount
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/lottery/activities/:id/draw
 * @desc    用户使用抽奖码参与线上抽奖
 * @access  Public
 */
router.post('/activities/:id/draw', [
  body('lottery_code')
    .notEmpty()
    .withMessage('抽奖码不能为空')
    .isLength({ min: 1, max: 50 })
    .withMessage('抽奖码长度不正确')
],
validateRequest,
logLotteryDraw(OPERATION_TYPES.ONLINE_LOTTERY),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { lottery_code } = req.body;

    // 整个抽奖流程在单个事务中（异常自动回滚）
    const { responseData, message } = await AppDataSource.transaction(async (manager) => {
      // 查找活动
      const activity = await manager.getRepository(Activity).findOneBy({ id: parseInt(activityId) });
      if (!activity) {
        throw createError('BUSINESS_ACTIVITY_NOT_FOUND');
      }

      // 检查活动是否可以抽奖
      const canStart = ActivityService.canStartLottery(activity);
      if (!canStart.canStart) {
        throw createError('BUSINESS_ACTIVITY_NOT_STARTED', canStart.reason);
      }

      // 查找抽奖码
      const lotteryCodeRecord = await LotteryCodeService.findByActivityAndCode(
        parseInt(activityId),
        lottery_code,
        manager,
      );
      if (!lotteryCodeRecord) {
        throw createError(
          'BUSINESS_LOTTERY_CODE_NOT_FOUND',
          '抽奖码不存在或不属于此活动'
        );
      }

      // 检查抽奖码是否已使用
      if (lotteryCodeRecord.status === 'used') {
        throw createError('BUSINESS_LOTTERY_CODE_USED');
      }

      // 检查是否已经抽过奖
      const existingRecord = await manager.getRepository(LotteryRecord).findOneBy({
        lottery_code_id: lotteryCodeRecord.id,
      } as any);

      if (existingRecord) {
        throw createError('BUSINESS_LOTTERY_CODE_USED', '该抽奖码已参与过抽奖');
      }

      // 执行抽奖逻辑
      let isWinner = false;
      let selectedPrize: Prize | null = null;

      // 根据概率选择奖品（内部会处理总和>1抛错，总和<1可能未中奖）
      const selectedPrizeRecord = await PrizeService.selectByProbability(
        parseInt(activityId),
        activity,
        { manager },
      );

      if (selectedPrizeRecord && selectedPrizeRecord.remaining_quantity > 0) {
        isWinner = true;
        selectedPrize = selectedPrizeRecord;

        // 扣减库存（在事务中）
        await PrizeService.deductStock(selectedPrize, 1, manager);
      } else {
        isWinner = false;
        selectedPrize = null;
      }

      // 标记抽奖码为已使用（在事务中）
      await LotteryCodeService.markAsUsed(lotteryCodeRecord, manager);

      // 创建抽奖记录（在事务中）
      const lotteryRecord = await LotteryRecordService.createRecord({
        activity_id: parseInt(activityId),
        lottery_code_id: lotteryCodeRecord.id,
        prize_id: selectedPrize ? selectedPrize.id : null,
        is_winner: isWinner,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      }, manager);

      // 准备响应数据
      const responseData: Record<string, unknown> = {
        is_winner: isWinner,
        lottery_record: {
          id: lotteryRecord.id,
          created_at: lotteryRecord.created_at
        },
        lottery_code: {
          code: lotteryCodeRecord.code,
          participant_info: lotteryCodeRecord.participant_info || {}
        }
      };

      if (isWinner && selectedPrize) {
        responseData.prize = {
          id: selectedPrize.id,
          name: selectedPrize.name,
          description: selectedPrize.description
        };
      }

      return { responseData, message: isWinner ? '恭喜您中奖了！' : '很遗憾，您没有中奖' };
    });

    res.json({
      success: true,
      data: responseData,
      message
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/lottery/activities/:id/offline-draw
 * @desc    管理员使用抽奖码进行线下抽奖
 * @access  Private (Admin)
 */
router.post('/activities/:id/offline-draw', [
  authenticateToken,
  requireAdmin,

  body('lottery_code')
    .notEmpty()
    .withMessage('抽奖码不能为空'),

  body('prize_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('奖品ID必须是正整数')
],
validateRequest,
logLotteryDraw(OPERATION_TYPES.OFFLINE_LOTTERY),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { lottery_code, prize_id } = req.body;

    const { responseData, message } = await AppDataSource.transaction(async (manager) => {
      // 查找活动
      const activity = await manager.getRepository(Activity).findOneBy({ id: parseInt(activityId) });
      if (!activity) {
        throw createError('BUSINESS_ACTIVITY_NOT_FOUND');
      }

      // 检查用户权限
      if ((req as any).user.role !== 'super_admin' && activity.created_by !== (req as any).user.id) {
        throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能管理自己创建的活动');
      }

      // 查找抽奖码
      const lotteryCodeRecord = await LotteryCodeService.findByActivityAndCode(
        parseInt(activityId),
        lottery_code,
        manager,
      );
      if (!lotteryCodeRecord) {
        throw createError(
          'BUSINESS_LOTTERY_CODE_NOT_FOUND',
          '抽奖码不存在或不属于此活动'
        );
      }

      // 检查抽奖码是否已使用
      if (lotteryCodeRecord.status === 'used') {
        throw createError('BUSINESS_LOTTERY_CODE_USED');
      }

      // 检查是否已经抽过奖
      const existingRecord = await manager.getRepository(LotteryRecord).findOneBy({
        lottery_code_id: lotteryCodeRecord.id,
      } as any);

      if (existingRecord) {
        throw createError('BUSINESS_LOTTERY_CODE_USED', '该抽奖码已参与过抽奖');
      }

      let isWinner = false;
      let selectedPrize: Prize | null = null;

      // 如果指定了奖品ID，使用指定奖品
      if (prize_id) {
        const prize = await manager.getRepository(Prize).findOneBy({ id: parseInt(prize_id) });
        if (!prize || prize.activity_id !== parseInt(activityId)) {
          throw createError('VALIDATION_INVALID_FORMAT', '奖品不存在或不属于此活动');
        }

        if (prize.remaining_quantity <= 0) {
          throw createError('BUSINESS_PRIZE_OUT_OF_STOCK');
        }

        isWinner = true;
        selectedPrize = prize;
        await PrizeService.deductStock(selectedPrize, 1, manager);
      } else {
        // 使用概率抽奖
        const selectedPrizeRecord = await PrizeService.selectByProbability(
          parseInt(activityId),
          activity,
          { manager },
        );

        if (selectedPrizeRecord && selectedPrizeRecord.remaining_quantity > 0) {
          isWinner = true;
          selectedPrize = selectedPrizeRecord;
          await PrizeService.deductStock(selectedPrize, 1, manager);
        } else {
          isWinner = false;
          selectedPrize = null;
        }
      }

      // 标记抽奖码为已使用
      await LotteryCodeService.markAsUsed(lotteryCodeRecord, manager);

      // 创建抽奖记录
      const lotteryRecord = await LotteryRecordService.createRecord({
        activity_id: parseInt(activityId),
        lottery_code_id: lotteryCodeRecord.id,
        prize_id: selectedPrize ? selectedPrize.id : null,
        is_winner: isWinner,
        operator_id: (req as any).user.id,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      }, manager);

      // 准备响应数据
      const responseData: Record<string, unknown> = {
        is_winner: isWinner,
        lottery_record: {
          id: lotteryRecord.id,
          created_at: lotteryRecord.created_at
        },
        lottery_code: {
          code: lotteryCodeRecord.code,
          participant_info: lotteryCodeRecord.participant_info || {}
        }
      };

      if (isWinner && selectedPrize) {
        responseData.prize = {
          id: selectedPrize.id,
          name: selectedPrize.name,
          description: selectedPrize.description
        };
      }

      return { responseData, message: isWinner ? '抽奖成功，参与者中奖！' : '很遗憾未中奖' };
    });

    res.json({
      success: true,
      data: responseData,
      message
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/lottery/activities/:id/records/:recordId/signature
 * @desc    上传签字图片（PNG data URL 直接存库）
 * @access  Private (Admin)
 */
router.post('/activities/:id/records/:recordId/signature', [
  authenticateToken,
  requireAdmin,
  body('image')
    .notEmpty()
    .withMessage('签字图片不能为空')
    .isString()
    .withMessage('签字图片必须是base64字符串')
],
validateRequest,
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = parseInt(req.params.id);
    const recordId = parseInt(req.params.recordId);
    const { image } = req.body;

    // 查找活动
    const activity = await ActivityService.findById(activityId);
    if (!activity) {
      throw createError('BUSINESS_ACTIVITY_NOT_FOUND');
    }

    // 检查用户权限
    if ((req as any).user.role !== 'super_admin' && activity.created_by !== (req as any).user.id) {
      throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能管理自己创建的活动');
    }

    // 查找抽奖记录
    const record = await LotteryRecordService.findById(recordId);
    if (!record) {
      throw createError('BUSINESS_LOTTERY_RECORD_NOT_FOUND', '抽奖记录不存在');
    }

    // 校验记录属于该活动
    if (record.activity_id !== activityId) {
      throw createError('VALIDATION_INVALID_FORMAT', '该记录不属于此活动');
    }

    // 校验是线下抽奖记录（有operator_id）
    if (!record.operator_id) {
      throw createError('VALIDATION_INVALID_FORMAT', '仅线下抽奖记录支持签字');
    }

    // 校验已经签过字
    if (record.signature_status === 'signed') {
      throw createError('BUSINESS_SIGNATURE_EXISTS', '该记录已签字，不可重复签字');
    }

    // 规范为完整 data URL（前端可能传裸 base64 或 data URL）
    const dataUrl = image.startsWith('data:')
      ? image
      : `data:image/png;base64,${image.replace(/^data:image\/png;base64,/, '')}`;

    // 限制大小（解码后 2MB）
    const MAX_SIZE = 2 * 1024 * 1024;
    const base64Payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (Buffer.from(base64Payload, 'base64').length > MAX_SIZE) {
      throw createError('VALIDATION_FILE_TOO_LARGE', '签字图片大小不能超过2MB');
    }

    // 直接存库（signed_at/signature_status 由服务层维护）
    await LotteryRecordService.updateSignature(recordId, {
      signature_data: dataUrl,
      signed_at: new Date(),
    });

    res.json({
      success: true,
      data: {
        record_id: recordId,
        signature_data: dataUrl,
        signed_at: new Date().toISOString(),
      },
      message: '签字上传成功',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/lottery/activities/:id/records/:recordId/signature
 * @desc    获取签字图片（data URL；列表接口不返回此大字段）
 * @access  Private (Admin)
 */
router.get('/activities/:id/records/:recordId/signature', [
  authenticateToken,
  requireAdmin,
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = parseInt(req.params.id);
    const recordId = parseInt(req.params.recordId);

    const activity = await ActivityService.findById(activityId);
    if (!activity) {
      throw createError('BUSINESS_ACTIVITY_NOT_FOUND');
    }

    if ((req as any).user.role !== 'super_admin' && activity.created_by !== (req as any).user.id) {
      throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能管理自己创建的活动');
    }

    const record = await LotteryRecordService.findById(recordId);
    if (!record) {
      throw createError('BUSINESS_LOTTERY_RECORD_NOT_FOUND', '抽奖记录不存在');
    }
    if (record.activity_id !== activityId) {
      throw createError('VALIDATION_INVALID_FORMAT', '该记录不属于此活动');
    }

    res.json({
      success: true,
      data: {
        record_id: recordId,
        signature_status: record.signature_status,
        signature_data: record.signature_data,
        signed_at: record.signed_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
