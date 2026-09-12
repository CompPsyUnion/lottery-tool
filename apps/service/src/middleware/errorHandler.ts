import { Request, Response, NextFunction } from 'express';
import { QueryFailedError } from 'typeorm';
import logger from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  const error = { ...err };
  error.message = err.message;

  // 记录错误日志
  logger.error(`Error: ${error.message}`, {
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // PostgreSQL 驱动错误（按 SQLSTATE 分类）
  if (err instanceof QueryFailedError || err.code?.startsWith?.('2') || err.code?.startsWith?.('23')) {
    const pgCode = (err as any).code as string | undefined;
    const constraint: string | undefined = (err as any).constraint;

    // 唯一约束冲突（23505）
    if (pgCode === '23505') {
      // constraint 形如 uq_users_username；从 detail 里取 'Key (username)=(...)' 更直观
      const detail: string | undefined = (err as any).detail;
      const field = detail?.match(/Key \((\w+)\)/)?.[1] ?? constraint ?? '字段';
      res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: `${field} 已存在`,
          details: '数据重复'
        }
      });
      return;
    }

    // 外键约束失败（23503）
    if (pgCode === '23503') {
      res.status(400).json({
        success: false,
        error: {
          code: 'FOREIGN_KEY_ERROR',
          message: '关联数据不存在',
          details: '外键约束失败'
        }
      });
      return;
    }

    // 其他查询/数据错误（如 22P02 枚举非法值、23502 非空约束）归为验证失败
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '数据验证失败',
        details: err.message
      }
    });
    return;
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_002',
        message: 'Token无效',
        details: 'JWT验证失败'
      }
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_002',
        message: 'Token已过期',
        details: 'JWT已过期'
      }
    });
    return;
  }

  // 语法错误
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_002',
        message: '请求数据格式错误',
        details: 'JSON格式无效'
      }
    });
    return;
  }

  // 自定义错误
  if (err.isCustomError) {
    res.status(err.statusCode || 400).json({
      success: false,
      error: {
        code: err.code || 'CUSTOM_ERROR',
        message: err.message,
        details: err.details
      }
    });
    return;
  }

  // 默认服务器错误
  res.status(500).json({
    success: false,
    error: {
      code: 'SYSTEM_003',
      message: '服务器内部错误',
      details: process.env.NODE_ENV === 'development' ? error.message : '请联系管理员'
    }
  });
};

export default errorHandler;
