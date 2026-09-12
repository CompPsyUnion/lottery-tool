import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

import { generateToken, authenticateToken, optionalAuth } from '../middleware/auth';
import { logAuthOperation } from '../middleware/operationLogger';
import { createError } from '../utils/customError';
import { AppDataSource } from '../utils/database';
import { User } from '../entities/user.entity';
import * as UserService from '../services/user.service';
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
 * @route   POST /api/auth/login
 * @desc    用户登录
 * @access  Public
 */
router.post('/login', [
  body('username')
    .notEmpty()
    .withMessage('用户名不能为空')
    .isLength({ min: 3, max: 50 })
    .withMessage('用户名长度为3-50个字符'),

  body('password')
    .notEmpty()
    .withMessage('密码不能为空')
    .isLength({ min: 6 })
    .withMessage('密码至少6个字符')
],
validateRequest,
logAuthOperation(OPERATION_TYPES.USER_LOGIN),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;

    // 查找用户
    const user = await UserService.findByUsername(username);
    if (!user) {
      throw createError('AUTH_INVALID_CREDENTIALS');
    }

    // 验证密码
    const isValidPassword = await UserService.validatePassword(user, password);
    if (!isValidPassword) {
      throw createError('AUTH_INVALID_CREDENTIALS');
    }

    // 检查账户状态
    if (user.status !== 'active') {
      throw createError('AUTH_ACCOUNT_DISABLED');
    }

    // 生成JWT token
    const token = generateToken(user.id);

    res.json({
      success: true,
      data: {
        token,
        user: UserService.toSafeUser(user)
      },
      message: '登录成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/register
 * @desc    注册账户。系统尚无用户时（首次注册）自动成为超级管理员，无需认证；
 *          已有用户后仅超级管理员可继续创建账户。
 * @access  Public（仅首位注册）/ Private (Super Admin only)
 */
router.post('/register', [
  // optionalAuth：首位注册无需token；已有用户后由处理器内校验超管身份
  optionalAuth,

  body('username')
    .notEmpty()
    .withMessage('用户名不能为空')
    .isLength({ min: 3, max: 50 })
    .withMessage('用户名长度为3-50个字符')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('用户名只能包含字母、数字和下划线'),

  body('email')
    .isEmail()
    .withMessage('邮箱格式不正确')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 6 })
    .withMessage('密码至少6个字符')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('密码必须包含字母和数字'),

  body('role')
    .optional()
    .isIn(['admin', 'super_admin'])
    .withMessage('角色只能是admin或super_admin')
],
validateRequest,
logAuthOperation(OPERATION_TYPES.USER_REGISTER),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password, role } = req.body;

    // 事务 + advisory lock：防止两个并发"首位注册"都看到空表而双双成为超管
    const { newUser, isFirstUser } = await AppDataSource.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('auth_register_bootstrap'))`);

      const userCount = await manager.getRepository(User).count();

      if (userCount > 0) {
        // 非首次注册：必须由超级管理员操作
        const operator = (req as any).user;
        if (!operator) {
          throw createError('AUTH_TOKEN_INVALID', '系统已完成初始化，注册需要超级管理员权限');
        }
        if (operator.role !== 'super_admin') {
          throw createError('AUTH_INSUFFICIENT_PERMISSION', '只有超级管理员可以创建账户');
        }
      }

      // 检查用户名是否已存在
      const existingUser = await manager.getRepository(User).findOneBy({ username });
      if (existingUser) {
        throw createError('VALIDATION_DUPLICATE_DATA', '用户名已存在');
      }

      // 检查邮箱是否已存在
      const existingEmail = await manager.getRepository(User).findOneBy({ email });
      if (existingEmail) {
        throw createError('VALIDATION_DUPLICATE_DATA', '邮箱已存在');
      }

      // 创建用户：首位注册者强制为超级管理员
      const isFirst = userCount === 0;
      const assignedRole = isFirst ? 'super_admin' : (role || 'admin');
      const passwordHash = await UserService.hashPassword(password);

      const created = await manager.getRepository(User).save({
        username,
        email,
        password_hash: passwordHash,
        role: assignedRole,
        status: 'active',
      });

      return { newUser: created, isFirstUser: isFirst };
    });

    res.status(201).json({
      success: true,
      data: {
        user: UserService.toSafeUser(newUser)
      },
      message: isFirstUser
        ? '注册成功，您是首位用户，已成为超级管理员'
        : '用户创建成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    获取当前用户信息
 * @access  Private
 */
router.get('/me',
authenticateToken,
async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 重新从数据库获取用户信息，确保数据最新
    const user = await UserService.findById((req as any).user.id);
    if (!user) {
      throw createError('AUTH_TOKEN_INVALID', '用户不存在');
    }

    res.json({
      success: true,
      data: {
        user: UserService.toSafeUser(user)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/auth/password
 * @desc    修改当前用户密码
 * @access  Private
 */
router.put('/password', [
  authenticateToken,

  body('old_password')
    .notEmpty()
    .withMessage('原密码不能为空'),

  body('new_password')
    .isLength({ min: 6 })
    .withMessage('新密码至少6个字符')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('新密码必须包含字母和数字')
],
validateRequest,
logAuthOperation(OPERATION_TYPES.PASSWORD_CHANGE),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { old_password, new_password } = req.body;

    // 获取当前用户
    const user = await UserService.findById((req as any).user.id);
    if (!user) {
      throw createError('AUTH_TOKEN_INVALID', '用户不存在');
    }

    // 验证原密码
    const isValidOldPassword = await UserService.validatePassword(user, old_password);
    if (!isValidOldPassword) {
      throw createError('AUTH_INVALID_CREDENTIALS', '原密码错误');
    }

    // 检查新密码是否与原密码相同
    const isSamePassword = await UserService.validatePassword(user, new_password);
    if (isSamePassword) {
      throw createError('VALIDATION_INVALID_FORMAT', '新密码不能与原密码相同');
    }

    // 更新密码
    await UserService.updatePassword(user, new_password);

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    用户登出
 * @access  Private
 */
router.post('/logout',
authenticateToken,
logAuthOperation(OPERATION_TYPES.USER_LOGOUT),
async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 这里可以实现token黑名单功能
    // 目前只是返回成功响应
    res.json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    刷新token
 * @access  Private
 */
router.post('/refresh',
authenticateToken,
async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 生成新的token
    const newToken = generateToken((req as any).user.id);

    res.json({
      success: true,
      data: {
        token: newToken
      },
      message: 'Token刷新成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/auth/validate-token
 * @desc    验证token有效性
 * @access  Private
 */
router.get('/validate-token',
authenticateToken,
async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: {
        valid: true,
        user: (req as any).user
      },
      message: 'Token有效'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
