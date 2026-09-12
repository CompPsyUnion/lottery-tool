import express, { Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { And, In, LessThan, LessThanOrEqual, MoreThanOrEqual, Not } from 'typeorm';
import bcrypt from 'bcryptjs';
import moment from 'moment';
import { authenticateToken, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { AppDataSource } from '../utils/database';
import { User } from '../entities/user.entity';
import { Activity } from '../entities/activity.entity';
import { LotteryRecord } from '../entities/lottery-record.entity';
import { OperationLog } from '../entities/operation-log.entity';
import * as OperationLogService from '../services/operation-log.service';
import * as UserService from '../services/user.service';

const router = express.Router();

// 所有system路由都需要认证和管理员权限
router.use(authenticateToken);
router.use(requireAdmin);

// ==================== 用户管理 ====================

// 获取用户列表
router.get('/users', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('role').optional().isIn(['super_admin', 'admin']).withMessage('角色必须是有效的角色类型'),
  query('search').optional().isString().withMessage('搜索关键词必须是字符串')
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
      role,
      search
    } = req.query as any;

    const offset = (page - 1) * limit;

    const qb = AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      // 不取 password_hash
      .select([
        'user.id',
        'user.username',
        'user.email',
        'user.role',
        'user.status',
        'user.created_at',
        'user.updated_at',
      ]);

    // 构建查询条件
    if (role) qb.andWhere('user.role = :role', { role });
    if (search) {
      qb.andWhere('(user.username ILIKE :search OR user.email ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [rows, count] = await qb
      .orderBy('user.created_at', 'DESC')
      .skip(Math.floor(offset))
      .take(parseInt(limit))
      .getManyAndCount();

    res.json({
      success: true,
      data: {
        users: rows,
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

// 获取用户详情
router.get('/users/:id', [
  param('id').isInt({ min: 1 }).withMessage('用户ID必须是正整数')
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

    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: parseInt(id) },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        created_at: true,
        updated_at: true,
      } as any,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

// 创建用户
router.post('/users', [
  body('username').isLength({ min: 3, max: 50 }).withMessage('用户名长度必须在3-50个字符之间'),
  body('email').isEmail().withMessage('邮箱格式不正确'),
  body('password').isLength({ min: 6 }).withMessage('密码长度至少6个字符'),
  // 数据库角色枚举只有 admin / super_admin；此接口仅创建普通管理员
  body('role').optional().isIn(['admin']).withMessage('角色必须是admin')
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

    const { username, email, password } = req.body;

    // 检查用户名和邮箱是否已存在
    const existingUser = await AppDataSource.getRepository(User).findOne({
      where: [{ username }, { email }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '用户名或邮箱已存在'
      });
    }

    // 创建用户
    const user = await AppDataSource.getRepository(User).save({
      username,
      email,
      password_hash: await bcrypt.hash(password, 10),
      role: 'admin',
      status: 'active',
    });

    // 记录操作日志
    await OperationLogService.log({
      user_id: (req as any).user.id,
      operation_type: OperationLogService.OPERATION_TYPES.CREATE_USER,
      operation_detail: `创建用户: ${user.username} (${user.role})`,
      target_type: 'USER',
      target_id: user.id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || null,
    });

    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: UserService.toSafeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

// 更新用户信息
router.put('/users/:id', [
  param('id').isInt({ min: 1 }).withMessage('用户ID必须是正整数'),
  body('username').optional().isLength({ min: 3, max: 50 }).withMessage('用户名长度必须在3-50个字符之间'),
  body('email').optional().isEmail().withMessage('邮箱格式不正确'),
  body('role').optional().isIn(['admin', 'super_admin']).withMessage('角色必须是admin或super_admin'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('状态必须是active或inactive')
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
    const { username, email, role, status } = req.body;

    const user = await UserService.findById(parseInt(id));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查是否修改超级管理员
    if (user.role === 'super_admin' && (req as any).user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '无权修改超级管理员信息'
      });
    }

    // 检查用户名和邮箱是否已被其他用户使用
    if (username || email) {
      const qb = AppDataSource.getRepository(User)
        .createQueryBuilder('user')
        .where('user.id != :id', { id: parseInt(id) });
      if (username) qb.andWhere('user.username = :username', { username });
      if (email) qb.andWhere('user.email = :email', { email });

      const existingUser = await qb.getOne();
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: '用户名或邮箱已被其他用户使用'
        });
      }
    }

    // 更新用户信息
    if (username) user.username = username;
    if (email) user.email = email;
    if (role) user.role = role;
    if (status) user.status = status;
    await AppDataSource.getRepository(User).save(user);

    // 记录操作日志
    await OperationLogService.log({
      user_id: (req as any).user.id,
      operation_type: OperationLogService.OPERATION_TYPES.UPDATE_USER,
      operation_detail: `更新用户: ${user.username}`,
      target_type: 'USER',
      target_id: user.id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || null,
    });

    res.json({
      success: true,
      message: '用户信息更新成功',
      data: UserService.toSafeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

// 重置用户密码
router.put('/users/:id/reset-password', [
  param('id').isInt({ min: 1 }).withMessage('用户ID必须是正整数'),
  body('new_password').isLength({ min: 6 }).withMessage('新密码长度至少6个字符')
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
    const { new_password } = req.body;

    const user = await UserService.findById(parseInt(id));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查是否修改超级管理员
    if (user.role === 'super_admin' && (req as any).user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '无权修改超级管理员密码'
      });
    }

    // 更新密码
    user.password_hash = await bcrypt.hash(new_password, 10);
    await AppDataSource.getRepository(User).save(user);

    // 记录操作日志
    await OperationLogService.log({
      user_id: (req as any).user.id,
      operation_type: 'RESET_USER_PASSWORD',
      operation_detail: `重置用户密码: ${user.username}`,
      target_type: 'USER',
      target_id: user.id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || null,
    });

    res.json({
      success: true,
      message: '密码重置成功'
    });
  } catch (error) {
    next(error);
  }
});

// 删除用户
router.delete('/users/:id', [
  param('id').isInt({ min: 1 }).withMessage('用户ID必须是正整数')
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

    const user = await UserService.findById(parseInt(id));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查是否删除超级管理员
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: '不能删除超级管理员'
      });
    }

    // 检查是否删除自己
    if (user.id === (req as any).user.id) {
      return res.status(400).json({
        success: false,
        message: '不能删除自己的账户'
      });
    }

    // 删除用户
    await AppDataSource.getRepository(User).remove(user);

    // 记录操作日志
    await OperationLogService.log({
      user_id: (req as any).user.id,
      operation_type: OperationLogService.OPERATION_TYPES.DELETE_USER,
      operation_detail: `删除用户: ${user.username} (${user.role})`,
      target_type: 'USER',
      target_id: user.id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || null,
    });

    res.json({
      success: true,
      message: '用户删除成功'
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 操作日志管理 ====================

// 获取操作日志列表
router.get('/logs', [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须是正整数'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('user_id').optional().isInt({ min: 1 }).withMessage('用户ID必须是正整数'),
  query('operation_type').optional().isString().withMessage('操作类型必须是字符串'),
  query('start_date').optional().isISO8601().withMessage('开始日期格式不正确'),
  query('end_date').optional().isISO8601().withMessage('结束日期格式不正确')
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
      user_id,
      operation_type,
      start_date,
      end_date
    } = req.query as any;

    const result = await OperationLogService.getList({
      page,
      limit,
      user_id,
      operation_type,
      start_date,
      end_date,
    });

    res.json({
      success: true,
      data: {
        logs: result.logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: (result.pagination as any).total,
          total_pages: Math.ceil((result.pagination as any).total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// 获取操作日志详情
router.get('/logs/:id', [
  param('id').isInt({ min: 1 }).withMessage('日志ID必须是正整数')
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

    const log = await AppDataSource.getRepository(OperationLog)
      .createQueryBuilder('log')
      .leftJoinAndMapOne('log.user', User, 'user', 'user.id = log.user_id')
      .addSelect(['user.id', 'user.username', 'user.email'])
      .where('log.id = :id', { id: parseInt(id) })
      .getOne();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: '操作日志不存在'
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    next(error);
  }
});

// 清空操作日志
router.delete('/logs', [
  query('before_date').optional().isISO8601().withMessage('日期格式不正确')
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

    const { before_date } = req.query;

    const result = await AppDataSource.getRepository(OperationLog).delete(
      before_date ? { created_at: LessThan(new Date(before_date as string)) } : {},
    );
    const deletedCount = result.affected ?? 0;

    // 记录操作日志
    await OperationLogService.log({
      user_id: (req as any).user.id,
      operation_type: 'CLEAR_OPERATION_LOGS',
      operation_detail: `清空操作日志 ${deletedCount} 条（${before_date || '全部'}）`,
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || null,
    });

    res.json({
      success: true,
      message: `成功清空 ${deletedCount} 条操作日志`
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 系统状态 ====================

// 获取系统概览信息
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const activityRepo = AppDataSource.getRepository(Activity);

    // 用户统计（角色枚举只有 super_admin / admin）
    const [totalUsers, adminUsers] = await Promise.all([
      userRepo.count(),
      userRepo.count({ where: { role: In(['admin', 'super_admin']) } }),
    ]);
    const participantUsers = totalUsers - adminUsers;

    // 活动统计
    const [totalActivities, activeActivities] = await Promise.all([
      activityRepo.count(),
      activityRepo.count({ where: { status: 'active' } }),
    ]);
    // 非进行中（draft + ended）计为 inactive
    const inactiveActivities = totalActivities - activeActivities;

    // 抽奖记录统计
    const recordRepo = AppDataSource.getRepository(LotteryRecord);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [totalRecords, todayRecords] = await Promise.all([
      recordRepo.count(),
      recordRepo.count({ where: { created_at: MoreThanOrEqual(today) } }),
    ]);

    // 系统运行时间（这里简化处理，实际可以从配置文件读取启动时间）
    const uptime = process.uptime();

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          admin: adminUsers,
          participant: participantUsers
        },
        activities: {
          total: totalActivities,
          active: activeActivities,
          inactive: inactiveActivities
        },
        lottery_records: {
          total: totalRecords,
          today: todayRecords
        },
        system: {
          uptime: Math.floor(uptime),
          uptime_formatted: moment.duration(uptime, 'seconds').humanize()
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// 获取系统健康状态
router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 检查数据库连接
    let dbStatus = 'unknown';
    try {
      await AppDataSource.getRepository(User).findOneBy({ id: 1 } as any);
      dbStatus = 'healthy';
    } catch (error) {
      dbStatus = 'unhealthy';
    }

    // 检查内存使用
    const memoryUsage = process.memoryUsage();
    const memoryStatus = memoryUsage.heapUsed / memoryUsage.heapTotal < 0.9 ? 'healthy' : 'warning';

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: dbStatus,
          memory: memoryStatus
        },
        metrics: {
          memory_usage: {
            heap_used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heap_total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024)
          },
          uptime: process.uptime()
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==================== 系统配置 ====================

// 获取系统配置
router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 这里可以从配置文件或数据库读取系统配置
    const config = {
      system_name: '抽奖系统',
      version: '1.0.0',
      max_file_size: 10 * 1024 * 1024, // 10MB
      allowed_file_types: ['.xlsx', '.xls', '.csv'],
      lottery_code_formats: [
        { value: '8_digits', label: '8位纯数字' },
        { value: '8_digits_letters', label: '8位数字+小写字母' },
        { value: '4_digits', label: '4位纯数字' },
        { value: '12_digits', label: '12位纯数字' },
        { value: '12_digits_letters', label: '12位纯数字+字母' }
      ],
      prize_types: [
        { value: 'physical', label: '实物奖品' },
        { value: 'virtual', label: '虚拟奖品' },
        { value: 'coupon', label: '优惠券' }
      ]
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    next(error);
  }
});

export default router;
