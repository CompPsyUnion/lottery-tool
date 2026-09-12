export class CustomError extends Error {
  code: string;
  statusCode: number;
  details: unknown;
  isCustomError: boolean;

  constructor(message: string, code: string = 'CUSTOM_ERROR', statusCode: number = 400, details: unknown = null) {
    super(message);
    this.name = 'CustomError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isCustomError = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// 错误类型定义
interface ErrorTypeDef {
  code: string;
  message: string;
  statusCode: number;
}

// 预定义的错误类型
export const ErrorTypes: Record<string, ErrorTypeDef> = {
  // 认证相关错误
  AUTH_INVALID_CREDENTIALS: { code: 'AUTH_001', message: '用户名或密码错误', statusCode: 401 },
  AUTH_TOKEN_INVALID: { code: 'AUTH_002', message: 'Token无效或已过期', statusCode: 401 },
  AUTH_INSUFFICIENT_PERMISSION: { code: 'AUTH_003', message: '权限不足', statusCode: 403 },
  AUTH_ACCOUNT_DISABLED: { code: 'AUTH_004', message: '账户已被禁用', statusCode: 403 },

  // 验证相关错误
  VALIDATION_MISSING_PARAMS: { code: 'VALIDATION_001', message: '请求参数缺失', statusCode: 400 },
  VALIDATION_INVALID_FORMAT: { code: 'VALIDATION_002', message: '参数格式错误', statusCode: 400 },
  VALIDATION_OUT_OF_RANGE: { code: 'VALIDATION_003', message: '参数值超出范围', statusCode: 400 },
  VALIDATION_DUPLICATE_DATA: { code: 'VALIDATION_004', message: '数据重复', statusCode: 400 },
  VALIDATION_FILE_TOO_LARGE: { code: 'VALIDATION_005', message: '文件大小超出限制', statusCode: 400 },

  // 业务相关错误
  BUSINESS_ACTIVITY_NOT_FOUND: { code: 'BUSINESS_001', message: '活动不存在', statusCode: 404 },
  BUSINESS_ACTIVITY_ENDED: { code: 'BUSINESS_002', message: '活动已结束', statusCode: 400 },
  BUSINESS_ACTIVITY_NOT_STARTED: { code: 'BUSINESS_003', message: '活动未开始', statusCode: 400 },
  BUSINESS_PRIZE_OUT_OF_STOCK: { code: 'BUSINESS_004', message: '奖品库存不足', statusCode: 400 },
  BUSINESS_LOTTERY_CODE_EXISTS: { code: 'BUSINESS_005', message: '抽奖码已存在', statusCode: 400 },
  BUSINESS_LOTTERY_CODE_USED: { code: 'BUSINESS_006', message: '抽奖码已使用', statusCode: 400 },
  BUSINESS_LOTTERY_CODE_NOT_FOUND: { code: 'BUSINESS_007', message: '抽奖码不存在', statusCode: 404 },
  BUSINESS_LOTTERY_RECORD_NOT_FOUND: { code: 'BUSINESS_008', message: '抽奖记录不存在', statusCode: 404 },
  BUSINESS_SIGNATURE_EXISTS: { code: 'BUSINESS_010', message: '该记录已签字，不可重复签字', statusCode: 400 },

  // 系统相关错误
  SYSTEM_DATABASE_ERROR: { code: 'SYSTEM_001', message: '数据库连接失败', statusCode: 500 },
  SYSTEM_FILE_UPLOAD_ERROR: { code: 'SYSTEM_002', message: '文件上传失败', statusCode: 500 },
  SYSTEM_INTERNAL_ERROR: { code: 'SYSTEM_003', message: '服务器内部错误', statusCode: 500 },
  SYSTEM_RATE_LIMITED: { code: 'SYSTEM_004', message: '请求频率过高', statusCode: 429 }
};

// 创建错误的便捷方法
// 说明：原 JS 实现中部分调用传入第三个参数（如 errors.array()），但该参数在
// CustomError 构造中并未使用（details 实际取自第二个参数）。为保持行为一致，
// 第三个参数在此处被忽略。
export function createError(type: string, details: unknown = null, _extra?: unknown): CustomError {
  const errorInfo = ErrorTypes[type];
  if (!errorInfo) {
    throw new Error(`Unknown error type: ${type}`);
  }
  return new CustomError(errorInfo.message, errorInfo.code, errorInfo.statusCode, details);
}
