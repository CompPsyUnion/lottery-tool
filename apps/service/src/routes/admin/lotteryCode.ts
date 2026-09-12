import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { logLotteryCodeOperation } from '../../middleware/operationLogger';
import { createError } from '../../utils/customError';
import { AppDataSource } from '../../utils/database';
import { LotteryCode } from '../../entities/lottery-code.entity';
import * as LotteryCodeService from '../../services/lottery-code.service';
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

// 按ID查找抽奖码（带活动信息，用于权限校验）
const findCodeWithActivity = (lotteryCodeId: string | number): Promise<LotteryCode | null> =>
  AppDataSource.getRepository(LotteryCode).findOne({
    where: { id: parseInt(String(lotteryCodeId)) },
    relations: { activity: true },
  });

/**
 * @route   PUT /api/admin/lottery-codes/:id/participant-info
 * @desc    修改抽奖码对应的参与者信息
 * @access  Private (Admin)
 */
router.put('/:id/participant-info', [
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
logLotteryCodeOperation(OPERATION_TYPES.UPDATE_LOTTERY_CODE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lotteryCodeId = req.params.id;
    const { participant_info } = req.body;

    const lotteryCode = await findCodeWithActivity(lotteryCodeId);

    if (!lotteryCode) {
      throw createError('BUSINESS_LOTTERY_CODE_NOT_FOUND');
    }

    // 检查用户权限
    if ((req as any).user.role !== 'super_admin' && lotteryCode.activity.created_by !== (req as any).user.id) {
      throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能修改自己创建的活动的抽奖码');
    }

    // 更新参与者信息
    await LotteryCodeService.updateParticipantInfo(lotteryCode, participant_info);

    res.json({
      success: true,
      data: {
        lottery_code: {
          id: lotteryCode.id,
          code: lotteryCode.code,
          participant_info: lotteryCode.participant_info
        }
      },
      message: '参与者信息更新成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/lottery-codes/template
 * @desc    下载抽奖码导入模板
 * @access  Private (Admin)
 */
router.get('/template', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 创建Excel模板的示例数据
    const templateData = [
      {
        '抽奖码': '12345678',
        '姓名': '张三',
        '手机号': '13800138000',
        '邮箱': 'zhangsan@example.com'
      },
      {
        '抽奖码': '87654321',
        '姓名': '李四',
        '手机号': '13900139000',
        '邮箱': 'lisi@example.com'
      }
    ];

    // 设置响应头，指示这是一个Excel下载
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=lottery_codes_template.xlsx');

    // 由于没有实际的Excel生成库，这里返回JSON格式的模板
    // 在实际项目中应该使用xlsx库生成真正的Excel文件
    res.json({
      success: true,
      data: {
        template_data: templateData,
        note: '实际环境中这里会下载Excel模板文件'
      },
      message: '模板下载成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/lottery-codes/:id
 * @desc    获取抽奖码详情
 * @access  Private (Admin)
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lotteryCodeId = req.params.id;

    const lotteryCode = await findCodeWithActivity(lotteryCodeId);

    if (!lotteryCode) {
      throw createError('BUSINESS_LOTTERY_CODE_NOT_FOUND');
    }

    // 检查用户权限
    if ((req as any).user.role !== 'super_admin' && lotteryCode.activity.created_by !== (req as any).user.id) {
      throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能查看自己创建的活动的抽奖码');
    }

    res.json({
      success: true,
      data: {
        lottery_code: lotteryCode
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/lottery-codes/:id
 * @desc    更新抽奖码信息（仅限参与者信息）
 * @access  Private (Admin)
 */
router.put('/:id', [
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
logLotteryCodeOperation(OPERATION_TYPES.UPDATE_LOTTERY_CODE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lotteryCodeId = req.params.id;
    const { participant_info } = req.body;

    const lotteryCode = await findCodeWithActivity(lotteryCodeId);

    if (!lotteryCode) {
      throw createError('BUSINESS_LOTTERY_CODE_NOT_FOUND');
    }

    // 检查用户权限
    if ((req as any).user.role !== 'super_admin' && lotteryCode.activity.created_by !== (req as any).user.id) {
      throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能修改自己创建的活动的抽奖码');
    }

    // 只允许修改参与者信息，不允许修改抽奖码本身
    if (participant_info) {
      await LotteryCodeService.updateParticipantInfo(lotteryCode, participant_info);
    }

    res.json({
      success: true,
      data: {
        lottery_code: lotteryCode
      },
      message: '抽奖码信息更新成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/admin/lottery-codes/:id
 * @desc    删除抽奖码
 * @access  Private (Admin)
 */
router.delete('/:id',
logLotteryCodeOperation(OPERATION_TYPES.DELETE_LOTTERY_CODE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lotteryCodeId = req.params.id;

    const lotteryCode = await findCodeWithActivity(lotteryCodeId);

    if (!lotteryCode) {
      throw createError('BUSINESS_LOTTERY_CODE_NOT_FOUND');
    }

    // 检查用户权限
    if ((req as any).user.role !== 'super_admin' && lotteryCode.activity.created_by !== (req as any).user.id) {
      throw createError('AUTH_INSUFFICIENT_PERMISSION', '只能删除自己创建的活动的抽奖码');
    }

    // 检查抽奖码是否已使用
    if (lotteryCode.status === 'used') {
      throw createError('VALIDATION_INVALID_FORMAT', '已使用的抽奖码无法删除');
    }

    await AppDataSource.getRepository(LotteryCode).remove(lotteryCode);

    res.json({
      success: true,
      message: '抽奖码删除成功'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
