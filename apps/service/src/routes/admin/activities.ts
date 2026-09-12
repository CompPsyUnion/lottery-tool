import express, { Request, Response, NextFunction } from 'express';
import { body, query, validationResult } from 'express-validator';
import { In } from 'typeorm';
import { logActivityOperation, logLotteryCodeOperation, logPrizeOperation } from '../../middleware/operationLogger';
import { createError } from '../../utils/customError';
import { generateBatchLotteryCodes, validateLotteryCodeFormat } from '../../utils/lotteryCodeGenerator';
import { AppDataSource } from '../../utils/database';
import { Activity } from '../../entities/activity.entity';
import { LotteryCode } from '../../entities/lottery-code.entity';
import * as ActivityService from '../../services/activity.service';
import * as PrizeService from '../../services/prize.service';
import * as LotteryCodeService from '../../services/lottery-code.service';
import * as LotteryRecordService from '../../services/lottery-record.service';
import { OPERATION_TYPES } from '../../services/operation-log.service';

const router = express.Router();

// 验证请求参数的中间件
const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(createError('VALIDATION_INVALID_FORMAT', '请求参数验证失败', errors.array()));
  }
  next();
};

// 验证活动存在且当前用户有权限
const requireActivityAccess = async (activityId: string, req: Request): Promise<Activity> => {
  const activity = await ActivityService.findById(parseInt(activityId));
  if (!activity) {
    throw createError('BUSINESS_ACTIVITY_NOT_FOUND');
  }

  if ((req as any).user.role !== 'super_admin' && activity.created_by !== (req as any).user.id) {
    throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能访问自己创建的活动');
  }

  return activity;
};

/**
 * @route   GET /api/admin/activities
 * @desc    获取活动列表
 * @access  Private (Admin)
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须是1-100的整数'),
  query('search').optional().isLength({ max: 100 }).withMessage('搜索关键词不能超过100个字符'),
  query('status').optional().isIn(['draft', 'active', 'ended']).withMessage('状态只能是draft、active或ended')
],
validateRequest,
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query as any;
    const userId = (req as any).user.id;

    const activities = await ActivityService.findByCreator(userId, {
      page,
      limit,
      search,
      status
    });

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/activities/:id
 * @desc    获取活动详情
 * @access  Private (Admin)
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;

    const activity = await requireActivityAccess(activityId, req);

    // 获取抽奖码统计
    const lotteryCodesCount = await LotteryCodeService.countByActivity(parseInt(activityId));

    const activityData: Record<string, unknown> = { ...activity };
    activityData.lottery_codes_count = lotteryCodesCount;

    res.json({
      success: true,
      data: {
        activity: activityData
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/activities
 * @desc    创建新活动
 * @access  Private (Admin)
 */
router.post('/', [
  body('name')
    .notEmpty()
    .withMessage('活动名称不能为空')
    .isLength({ min: 1, max: 100 })
    .withMessage('活动名称长度为1-100个字符'),

  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('活动描述不能超过1000个字符'),

  body('lottery_mode')
    .isIn(['offline', 'online'])
    .withMessage('抽奖模式只能是offline或online'),

  body('start_time')
    .optional()
    .isISO8601()
    .withMessage('开始时间格式错误'),

  body('end_time')
    .optional()
    .isISO8601()
    .withMessage('结束时间格式错误'),

  body('settings.max_lottery_codes')
    .optional()
    .isInt({ min: 1 })
    .withMessage('最大抽奖码数量必须是正整数'),

  body('settings.lottery_code_format')
    .optional()
    .isIn(['4_digit_number', '8_digit_number', '8_digit_alphanumeric', '12_digit_number', '12_digit_alphanumeric'])
    .withMessage('抽奖码格式不正确')
],
validateRequest,
logActivityOperation(OPERATION_TYPES.CREATE_ACTIVITY),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, lottery_mode, start_time, end_time, settings } = req.body;

    // 验证时间逻辑
    if (start_time && end_time && new Date(start_time) >= new Date(end_time)) {
      throw createError('VALIDATION_INVALID_FORMAT', '开始时间必须早于结束时间');
    }

    const activityData: Partial<Activity> = {
      name,
      description,
      lottery_mode,
      start_time: start_time ? new Date(start_time) : null,
      end_time: end_time ? new Date(end_time) : null,
      created_by: (req as any).user.id,
      status: 'draft'
    };

    // 设置活动配置（默认值由服务层补全）
    if (settings) {
      activityData.settings = {
        max_lottery_codes: settings.max_lottery_codes || 1000,
        lottery_code_format: settings.lottery_code_format || '8_digit_number',
        allow_duplicate_phone: settings.allow_duplicate_phone || false,
        require_signature: settings.require_signature === true
      };
    }

    const activity = await ActivityService.createActivity(activityData);

    res.status(201).json({
      success: true,
      data: {
        activity
      },
      message: '活动创建成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/activities/:id
 * @desc    更新活动信息
 * @access  Private (Admin)
 */
router.put('/:id', [
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('活动名称长度为1-100个字符'),

  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('活动描述不能超过1000个字符'),

  body('status')
    .optional()
    .isIn(['draft', 'active', 'ended'])
    .withMessage('状态只能是draft、active或ended'),

  body('start_time')
    .optional()
    .isISO8601()
    .withMessage('开始时间格式错误'),

  body('end_time')
    .optional()
    .isISO8601()
    .withMessage('结束时间格式错误')
],
validateRequest,
logActivityOperation(OPERATION_TYPES.UPDATE_ACTIVITY),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const updateData = req.body;

    const activity = await requireActivityAccess(activityId, req);

    // 验证时间逻辑
    const startTime = updateData.start_time ? new Date(updateData.start_time) : activity.start_time;
    const endTime = updateData.end_time ? new Date(updateData.end_time) : activity.end_time;

    if (startTime && endTime && startTime >= endTime) {
      throw createError('VALIDATION_INVALID_FORMAT', '开始时间必须早于结束时间');
    }

    // 更新活动（时间字段转Date）
    if (updateData.start_time) updateData.start_time = new Date(updateData.start_time);
    if (updateData.end_time) updateData.end_time = new Date(updateData.end_time);

    const updated = await AppDataSource.getRepository(Activity).save({
      ...activity,
      ...updateData,
    });

    res.json({
      success: true,
      data: {
        activity: updated
      },
      message: '活动更新成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/admin/activities/:id
 * @desc    删除活动
 * @access  Private (Admin)
 */
router.delete('/:id',
logActivityOperation(OPERATION_TYPES.DELETE_ACTIVITY),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;

    const activity = await requireActivityAccess(activityId, req);

    // 检查活动状态
    if (activity.status === 'active') {
      throw createError('VALIDATION_INVALID_FORMAT', '不能删除进行中的活动');
    }

    await AppDataSource.getRepository(Activity).remove(activity);

    res.json({
      success: true,
      message: '活动删除成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/activities/:id/lottery-codes
 * @desc    获取活动的抽奖码列表
 * @access  Private (Admin)
 */
router.get('/:id/lottery-codes', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须是1-100的整数'),
  query('search').optional().isLength({ max: 100 }).withMessage('搜索关键词不能超过100个字符'),
  query('status').optional().isIn(['unused', 'used']).withMessage('状态只能是unused或used'),
  query('has_participant_info').optional().isBoolean().withMessage('has_participant_info必须是布尔值')
],
validateRequest,
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { page = 1, limit = 20, search, status, has_participant_info } = req.query as any;

    await requireActivityAccess(activityId, req);

    const result = await LotteryCodeService.findByActivity(parseInt(activityId), {
      page,
      limit,
      search,
      status,
      has_participant_info: has_participant_info === 'true' ? true : has_participant_info === 'false' ? false : undefined
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/activities/:id/lottery-codes/batch
 * @desc    批量创建抽奖码
 * @access  Private (Admin)
 */
router.post('/:id/lottery-codes/batch', [
  body('count')
    .isInt({ min: 1, max: 1000 })
    .withMessage('创建数量必须是1-1000的整数')
],
validateRequest,
logLotteryCodeOperation(OPERATION_TYPES.BATCH_CREATE_LOTTERY_CODE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { count } = req.body;

    const activity = await requireActivityAccess(activityId, req);

    // 获取活动设置
    const settings = activity.settings || {};
    const lotteryCodeFormat = settings.lottery_code_format || '8_digit_number';
    const maxLotteryCodes = settings.max_lottery_codes || 1000;

    // 检查是否超过最大限制
    const existingCount = await LotteryCodeService.countByActivity(parseInt(activityId));

    if (existingCount + count > maxLotteryCodes) {
      throw createError('VALIDATION_OUT_OF_RANGE', `超过活动最大抽奖码限制 ${maxLotteryCodes}`);
    }

    // 获取已存在的抽奖码
    const existingCodes = await LotteryCodeService.getAllCodesForActivity(parseInt(activityId));

    // 生成新的抽奖码
    const newCodes = generateBatchLotteryCodes(lotteryCodeFormat as string, count, existingCodes);

    // 批量创建抽奖码
    const createdCodes = await LotteryCodeService.createBatch(parseInt(activityId), newCodes);

    res.status(201).json({
      success: true,
      data: {
        created_count: createdCodes.length,
        lottery_codes: createdCodes
      },
      message: `成功创建 ${createdCodes.length} 个抽奖码`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/activities/:id/webhook-info
 * @desc    获取活动的Webhook接口信息
 * @access  Private (Admin)
 */
router.get('/:id/webhook-info', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;

    const activity = await requireActivityAccess(activityId, req);

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    res.json({
      success: true,
      data: {
        webhook_url: `${baseUrl}/api/webhook/activities/${activity.webhook_id}/lottery-codes`,
        webhook_token: activity.webhook_token,
        activity_id: activity.webhook_id
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/activities/:id/lottery-codes
 * @desc    单个添加抽奖码
 * @access  Private (Admin)
 */
router.post('/:id/lottery-codes', [
  body('code')
    .notEmpty()
    .withMessage('抽奖码不能为空')
    .isLength({ min: 1, max: 50 })
    .withMessage('抽奖码长度不正确'),

  body('participant_info.name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('姓名长度为1-100个字符'),

  body('participant_info.phone')
    .optional()
    .isMobilePhone('zh-CN')
    .withMessage('手机号格式不正确'),

  body('participant_info.email')
    .optional()
    .isEmail()
    .withMessage('邮箱格式不正确')
],
validateRequest,
logLotteryCodeOperation(OPERATION_TYPES.CREATE_LOTTERY_CODE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { code, participant_info } = req.body;

    const activity = await requireActivityAccess(activityId, req);

    // 验证抽奖码格式
    const settings = activity.settings || {};
    const lotteryCodeFormat = settings.lottery_code_format || '8_digit_number';

    if (!validateLotteryCodeFormat(code, lotteryCodeFormat as string)) {
      throw createError('VALIDATION_INVALID_FORMAT', `抽奖码格式不符合要求：${lotteryCodeFormat}`);
    }

    // 检查抽奖码是否已存在
    const existingCode = await LotteryCodeService.findByActivityAndCode(parseInt(activityId), code);
    if (existingCode) {
      throw createError('BUSINESS_LOTTERY_CODE_EXISTS', '抽奖码已存在');
    }

    // 检查是否超过最大限制
    const maxLotteryCodes = settings.max_lottery_codes || 1000;
    const existingCount = await LotteryCodeService.countByActivity(parseInt(activityId));

    if (existingCount >= maxLotteryCodes) {
      throw createError('VALIDATION_OUT_OF_RANGE', `超过活动最大抽奖码限制 ${maxLotteryCodes}`);
    }

    // 创建抽奖码
    const lotteryCode = await AppDataSource.getRepository(LotteryCode).save({
      activity_id: parseInt(activityId),
      code: code,
      participant_info: participant_info || null,
      status: 'unused'
    });

    res.status(201).json({
      success: true,
      data: {
        lottery_code: lotteryCode
      },
      message: '抽奖码添加成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/activities/:id/lottery-codes/import
 * @desc    批量导入抽奖码
 * @access  Private (Admin)
 */
router.post('/:id/lottery-codes/import',
logLotteryCodeOperation(OPERATION_TYPES.IMPORT_LOTTERY_CODE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;

    await requireActivityAccess(activityId, req);

    // 这里应该处理文件上传和解析
    // 由于没有配置multer，先返回一个占位响应
    res.json({
      success: true,
      data: {
        imported_count: 0,
        lottery_codes: []
      },
      message: '批量导入功能开发中'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/activities/:id/lottery-codes/:code/invalidate
 * @desc    管理员作废抽奖码
 * @access  Private (Admin)
 */
router.put('/:id/lottery-codes/:code/invalidate', [
  body('reason').optional().isString().isLength({ max: 500 }).withMessage('作废原因不能超过500字符')
],
validateRequest,
logLotteryCodeOperation(OPERATION_TYPES.INVALIDATE_LOTTERY_CODE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { code } = req.params;
    const { reason } = req.body;

    const activity = await requireActivityAccess(activityId, req);

    const lotteryCode = await LotteryCodeService.findByActivityAndCode(parseInt(activityId), code);

    if (!lotteryCode) {
      throw createError('BUSINESS_LOTTERY_CODE_NOT_FOUND', '抽奖码不存在');
    }

    // 检查抽奖码当前状态
    if (lotteryCode.status === 'invalid') {
      throw createError('VALIDATION_INVALID_FORMAT', '抽奖码已经作废');
    }

    // 标记为作废
    await LotteryCodeService.markAsInvalid(lotteryCode);

    res.json({
      success: true,
      message: '抽奖码作废成功',
      data: {
        lottery_code: {
          id: lotteryCode.id,
          code: lotteryCode.code,
          status: lotteryCode.status,
          activity_id: lotteryCode.activity_id,
          activity_name: activity.name,
          reason: reason || '管理员作废',
          invalidated_at: new Date()
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/activities/:id/lottery-codes/batch-invalidate
 * @desc    管理员批量作废抽奖码
 * @access  Private (Admin)
 */
router.put('/:id/lottery-codes/batch-invalidate', [
  body('codes').isArray({ min: 1, max: 100 }).withMessage('抽奖码数组不能为空且最多100个'),
  body('codes.*').isString().isLength({ min: 1 }).withMessage('抽奖码不能为空'),
  body('reason').optional().isString().isLength({ max: 500 }).withMessage('作废原因不能超过500字符')
],
validateRequest,
logLotteryCodeOperation(OPERATION_TYPES.BATCH_INVALIDATE_LOTTERY_CODE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { codes, reason } = req.body;

    const activity = await requireActivityAccess(activityId, req);

    const lotteryCodes = await AppDataSource.getRepository(LotteryCode).find({
      where: {
        code: In(codes),
        activity_id: parseInt(activityId),
      },
      relations: { activity: true },
    });

    const results: any[] = [];
    const invalidatedCodes: string[] = [];

    for (const code of codes) {
      const lotteryCode = lotteryCodes.find(lc => lc.code === code);

      if (!lotteryCode) {
        results.push({
          code,
          success: false,
          message: '抽奖码不存在'
        });
        continue;
      }

      if (lotteryCode.status === 'invalid') {
        results.push({
          code,
          success: false,
          message: '抽奖码已经作废'
        });
        continue;
      }

      try {
        await LotteryCodeService.markAsInvalid(lotteryCode);
        results.push({
          code,
          success: true,
          message: '作废成功',
          lottery_code_id: lotteryCode.id,
          activity_name: activity.name
        });
        invalidatedCodes.push(code);
      } catch (error: any) {
        results.push({
          code,
          success: false,
          message: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `批量作废完成，成功作废${invalidatedCodes.length}个抽奖码`,
      data: {
        results,
        summary: {
          total: codes.length,
          success: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          reason: reason || '管理员批量作废',
          invalidated_codes: invalidatedCodes
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/activities/:id/records
 * @desc    获取指定活动的抽奖记录列表
 * @access  Private (Admin)
 */
router.get('/:id/records', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须是1-100的整数'),
  query('keyword').optional().isLength({ max: 100 }).withMessage('搜索关键词不能超过100个字符')
],
validateRequest,
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { page = 1, limit = 20, keyword } = req.query as any;

    await requireActivityAccess(activityId, req);

    // 获取抽奖记录列表
    const result = await LotteryRecordService.findByActivity(parseInt(activityId), {
      page,
      limit,
      keyword
    });

    // 精简返回数据结构
    const simplifiedRecords = (result.records as any[]).map((record: any) => {
      const simplified: Record<string, unknown> = {
        id: record.id,
        activity_id: record.activity_id,
        lottery_code_id: record.lottery_code_id,
        prize_id: record.prize_id,
        is_winner: record.is_winner,
        operator_id: record.operator_id,
        ip_address: record.ip_address,
        user_agent: record.user_agent,
        created_at: record.created_at,
        signed_at: record.signed_at,
        signature_status: record.signature_status || 'unsigned',
        lotteryCode: record.lotteryCode?.code,
        prize: record.prize?.name,
        operator: record.operator?.username
      };

      // 只有存在时才添加参与者信息（来自抽奖码的JSON字段）
      if (record.lotteryCode?.participant_info?.phone) {
        simplified.phone = record.lotteryCode.participant_info.phone;
      }
      if (record.lotteryCode?.participant_info?.email) {
        simplified.email = record.lotteryCode.participant_info.email;
      }
      if (record.lotteryCode?.participant_info?.name) {
        simplified.name = record.lotteryCode.participant_info.name;
      }

      return simplified;
    });

    res.json({
      success: true,
      data: {
        records: simplifiedRecords,
        pagination: result.pagination
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/activities/:id/prizes
 * @desc    获取指定活动的奖品列表
 * @access  Private (Admin)
 */
router.get('/:id/prizes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;

    await requireActivityAccess(activityId, req);

    const prizes = await PrizeService.findByActivity(parseInt(activityId));

    res.json({
      success: true,
      data: {
        prizes
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/activities/:id/prizes
 * @desc    为活动添加奖品
 * @access  Private (Admin)
 */
router.post('/:id/prizes', [
  body('name')
    .notEmpty()
    .withMessage('奖品名称不能为空')
    .isLength({ min: 1, max: 100 })
    .withMessage('奖品名称长度为1-100个字符'),

  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('奖品描述不能超过500个字符'),

  body('total_quantity')
    .isInt({ min: 0 })
    .withMessage('奖品总数量必须是非负整数'),

  body('probability')
    .isFloat({ min: 0, max: 1 })
    .withMessage('中奖概率必须是0-1之间的数值'),

  body('sort_order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('排序值必须是非负整数')
],
validateRequest,
logPrizeOperation(OPERATION_TYPES.CREATE_PRIZE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityId = req.params.id;
    const { name, description, total_quantity, probability, sort_order } = req.body;

    await requireActivityAccess(activityId, req);

    const prize = await PrizeService.createPrize({
      activity_id: parseInt(activityId),
      name,
      description,
      total_quantity,
      remaining_quantity: total_quantity,
      probability,
      sort_order: sort_order || 0
    });

    res.status(201).json({
      success: true,
      data: {
        prize
      },
      message: '奖品添加成功'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
