import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateWebhook } from '../middleware/auth';
import { createError } from '../utils/customError';
import { validateLotteryCodeFormat } from '../utils/lotteryCodeGenerator';
import * as LotteryCodeService from '../services/lottery-code.service';
import * as OperationLogService from '../services/operation-log.service';
import { AppDataSource } from '../utils/database';
import { LotteryCode } from '../entities/lottery-code.entity';

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
 * @route   POST /api/webhook/activities/:webhook_id/lottery-codes
 * @desc    通过Webhook批量添加抽奖码（第三方系统调用）
 * @access  Webhook (requires webhook token)
 */
router.post('/activities/:webhook_id/lottery-codes', [
  authenticateWebhook,

  // 验证lottery_codes数组
  body('lottery_codes')
    .isArray({ min: 1, max: 100 })
    .withMessage('lottery_codes必须是包含1-100个元素的数组'),

  // 验证数组中的每个抽奖码对象
  body('lottery_codes.*.code')
    .notEmpty()
    .withMessage('抽奖码不能为空')
    .isLength({ min: 1, max: 50 })
    .withMessage('抽奖码长度不正确'),

  // 验证参与者信息（可选）
  body('lottery_codes.*.participant_info.name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('姓名长度为1-100个字符'),

  body('lottery_codes.*.participant_info.phone')
    .optional()
    .isMobilePhone('zh-CN')
    .withMessage('手机号格式不正确'),

  body('lottery_codes.*.participant_info.email')
    .optional()
    .isEmail()
    .withMessage('邮箱格式不正确')
],
validateRequest,
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lottery_codes } = req.body;
    const activity = (req as any).activity; // 从中间件获取

    // 获取活动设置
    const settings = activity.settings || {};
    const lotteryCodeFormat = settings.lottery_code_format || '8_digit_number';
    const maxLotteryCodes = settings.max_lottery_codes || 1000;

    // 检查是否超过最大限制
    const existingCount = await LotteryCodeService.countByActivity(activity.id);

    if (existingCount + lottery_codes.length > maxLotteryCodes) {
      throw createError('VALIDATION_OUT_OF_RANGE', `批量添加后将超过活动最大抽奖码限制 ${maxLotteryCodes}`);
    }

    const createdCodes: LotteryCode[] = [];
    const failedCodes: string[] = [];
    let createdCount = 0;
    let failedCount = 0;

    // 批量处理抽奖码
    for (const lotteryCodeData of lottery_codes) {
      try {
        const { code, participant_info } = lotteryCodeData;

        // 验证抽奖码格式
        if (!validateLotteryCodeFormat(code, lotteryCodeFormat)) {
          failedCodes.push(code);
          failedCount++;
          continue;
        }

        // 检查抽奖码是否已存在
        const existingCode = await LotteryCodeService.findByActivityAndCode(activity.id, code);
        if (existingCode) {
          failedCodes.push(code);
          failedCount++;
          continue;
        }

        // 创建抽奖码
        const lotteryCode = await AppDataSource.getRepository(LotteryCode).save({
          activity_id: activity.id,
          code,
          participant_info: (participant_info as LotteryCode['participant_info']) || null,
          status: 'unused',
        });

        createdCodes.push(lotteryCode);
        createdCount++;

        // 记录操作日志
        await OperationLogService.log({
          user_id: null, // Webhook调用没有用户ID
          operation_type: OperationLogService.OPERATION_TYPES.WEBHOOK_CREATE_LOTTERY_CODE,
          operation_detail: `Webhook创建抽奖码: ${code}`,
          target_type: 'ACTIVITY',
          target_id: activity.id,
          ip_address: req.ip,
          user_agent: req.get('User-Agent') || null
        });

      } catch (error) {
        failedCodes.push(lotteryCodeData.code);
        failedCount++;
      }
    }

    res.status(201).json({
      success: true,
      data: {
        created_count: createdCount,
        failed_count: failedCount,
        failed_codes: failedCodes,
        lottery_codes: createdCodes.map(code => ({
          id: code.id,
          code: code.code,
          status: code.status,
          participant_info: code.participant_info,
          created_at: code.created_at
        }))
      },
      message: `成功创建 ${createdCount} 个抽奖码${failedCount > 0 ? `，${failedCount} 个创建失败` : ''}`
    });
  } catch (error) {
    next(error);
  }
});

export default router;
