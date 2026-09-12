import express, { Request, Response, NextFunction } from 'express';
import { In } from 'typeorm';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { AppDataSource } from '../utils/database';
import { User } from '../entities/user.entity';
import { Activity } from '../entities/activity.entity';
import { LotteryCode } from '../entities/lottery-code.entity';
import { LotteryRecord } from '../entities/lottery-record.entity';

const router = express.Router();

// 所有dashboard路由都需要认证和管理员权限
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @route   GET /api/dashboard
 * @desc    获取仪表盘统计数据
 * @access  Private (Admin/Super Admin)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    let dashboardData: Record<string, unknown> = {};

    if (user.role === 'super_admin') {
      // 超级管理员：返回系统中活动总数、抽奖码总数、管理员总数、抽奖记录总数
      const [totalActivities, totalLotteryCodes, totalAdmins, totalLotteryRecords] = await Promise.all([
        AppDataSource.getRepository(Activity).count(),
        AppDataSource.getRepository(LotteryCode).count(),
        AppDataSource.getRepository(User).count({
          where: { role: In(['admin', 'super_admin']) },
        }),
        AppDataSource.getRepository(LotteryRecord).count(),
      ]);

      dashboardData = {
        totalActivities,
        totalLotteryCodes,
        totalAdmins,
        totalLotteryRecords
      };
    } else {
      // 管理员：返回此用户创建的活动总数、抽奖码总数、抽奖记录总数、和系统中用户总数
      const [userActivities, userLotteryCodes, userLotteryRecords, totalUsers] = await Promise.all([
        AppDataSource.getRepository(Activity).count({ where: { created_by: user.id } }),
        AppDataSource.getRepository(LotteryCode)
          .createQueryBuilder('lottery_code')
          .innerJoin('lottery_code.activity', 'activity')
          .where('activity.created_by = :userId', { userId: user.id })
          .getCount(),
        AppDataSource.getRepository(LotteryRecord)
          .createQueryBuilder('record')
          .innerJoin('record.activity', 'activity')
          .where('activity.created_by = :userId', { userId: user.id })
          .getCount(),
        AppDataSource.getRepository(User).count(),
      ]);

      dashboardData = {
        userActivities,
        userLotteryCodes,
        userLotteryRecords,
        totalUsers
      };
    }

    res.json({
      success: true,
      data: dashboardData,
      message: '仪表盘数据获取成功'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
