import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { createError } from '../utils/customError';
import * as UserService from '../services/user.service';
import * as ActivityService from '../services/activity.service';

/**
 * JWT Token 验证中间件
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw createError('AUTH_TOKEN_INVALID', 'Token缺失');
    }

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number };

    // 查找用户
    const user = await UserService.findById(decoded.userId);
    if (!user) {
      throw createError('AUTH_TOKEN_INVALID', '用户不存在');
    }

    if (user.status !== 'active') {
      throw createError('AUTH_ACCOUNT_DISABLED');
    }

    // 将用户信息添加到请求对象
    (req as any).user = UserService.toSafeUser(user);
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return next(createError('AUTH_TOKEN_INVALID', 'Token格式错误'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(createError('AUTH_TOKEN_INVALID', 'Token已过期'));
    }
    next(error);
  }
};

/**
 * 管理员权限验证中间件
 * 检查用户是否具有管理员权限
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!(req as any).user) {
    return next(createError('AUTH_TOKEN_INVALID', '未认证'));
  }

  if (!['admin', 'super_admin'].includes((req as any).user.role)) {
    return next(createError('AUTH_INSUFFICIENT_PERMISSION', '需要管理员权限'));
  }

  next();
};

/**
 * 超级管理员权限验证中间件
 * 检查用户是否具有超级管理员权限
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!(req as any).user) {
    return next(createError('AUTH_TOKEN_INVALID', '未认证'));
  }

  if ((req as any).user.role !== 'super_admin') {
    return next(createError('AUTH_INSUFFICIENT_PERMISSION', '需要超级管理员权限'));
  }

  next();
};

/**
 * 可选认证中间件
 * 如果提供了token则验证，否则继续执行
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // 没有token，继续执行
    }

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number };

    // 查找用户
    const user = await UserService.findById(decoded.userId);
    if (user && user.status === 'active') {
      (req as any).user = UserService.toSafeUser(user);
    }

    next();
  } catch (error) {
    // 可选认证失败不阻止请求继续
    next();
  }
};

/**
 * Webhook认证中间件
 * 验证Webhook请求的token
 */
export const authenticateWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw createError('AUTH_TOKEN_INVALID', 'Webhook Token缺失');
    }

    // 从URL参数获取webhook_id
    const webhookId = req.params.webhook_id;
    if (!webhookId) {
      throw createError('VALIDATION_MISSING_PARAMS', 'Webhook ID缺失');
    }

    // 查找对应的活动
    const activity = await ActivityService.findByWebhookId(webhookId);

    if (!activity) {
      throw createError('BUSINESS_ACTIVITY_NOT_FOUND', '活动不存在');
    }

    // 验证webhook token
    if (activity.webhook_token !== token) {
      throw createError('AUTH_TOKEN_INVALID', 'Webhook Token无效');
    }

    // 将活动信息添加到请求对象
    (req as any).activity = activity;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 生成JWT Token
 */
export const generateToken = (userId: number): string => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET as string,
    { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '24h' }
  );
};

/**
 * 验证JWT Token（不用于中间件）
 */
export const verifyToken = (token: string): jwt.JwtPayload | string | null => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET as string);
  } catch (error) {
    return null;
  }
};
