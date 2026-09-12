import { Request, Response, NextFunction } from 'express';
import { OPERATION_TYPES, log as writeOperationLog } from '../services/operation-log.service';
import logger from '../utils/logger';

type GetOperationDetail = (req: Request, res: Response, data: any) => string;
type GetTargetInfo = (req: Request, res: Response, data: any) => { type: string | null; id: string | number | null } | null;

/**
 * 操作日志记录中间件
 * 自动记录用户的操作行为
 */
export const logOperation = (
  operationType: string,
  getOperationDetail: GetOperationDetail | null = null,
  getTargetInfo: GetTargetInfo | null = null
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const originalSend = res.send;

    res.send = function (data: any) {
      // 只在操作成功时记录日志
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // 异步记录日志，不阻塞响应
        setImmediate(async () => {
          try {
            let operationDetail: string = operationType;
            let targetType: string | null = null;
            let targetId: string | number | null = null;

            // 如果提供了操作详情生成函数
            if (typeof getOperationDetail === 'function') {
              operationDetail = getOperationDetail(req, res, data);
            }

            // 如果提供了目标信息生成函数
            if (typeof getTargetInfo === 'function') {
              const targetInfo = getTargetInfo(req, res, data);
              if (targetInfo) {
                targetType = targetInfo.type;
                targetId = targetInfo.id;
              }
            }

            await writeOperationLog({
              user_id: (req as any).user ? (req as any).user.id : null,
              operation_type: operationType,
              operation_detail: operationDetail,
              target_type: targetType,
              target_id: targetId as any,
              ip_address: req.ip,
              user_agent: req.get('User-Agent') || null
            });
          } catch (error) {
            logger.error('记录操作日志失败:', error);
          }
        });
      }

      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * 记录认证操作日志
 */
export const logAuthOperation = (operationType: string) => {
  return logOperation(operationType, (req: Request, _res: Response, _data: any) => {
    switch (operationType) {
      case OPERATION_TYPES.USER_LOGIN:
        return `用户登录: ${req.body.username}`;
      case OPERATION_TYPES.USER_LOGOUT:
        return '用户登出';
      case OPERATION_TYPES.PASSWORD_CHANGE:
        return '修改密码';
      default:
        return operationType;
    }
  });
};

/**
 * 记录活动操作日志
 */
export const logActivityOperation = (operationType: string) => {
  return logOperation(
    operationType,
    (req: Request, _res: Response, data: any) => {
      const activityName = req.body.name ||
        (data && JSON.parse(data).data && JSON.parse(data).data.activity && JSON.parse(data).data.activity.name) ||
        '未知活动';

      switch (operationType) {
        case OPERATION_TYPES.CREATE_ACTIVITY:
          return `创建活动: ${activityName}`;
        case OPERATION_TYPES.UPDATE_ACTIVITY:
          return `更新活动: ${activityName}`;
        case OPERATION_TYPES.DELETE_ACTIVITY:
          return `删除活动: ${activityName}`;
        case OPERATION_TYPES.ACTIVATE_ACTIVITY:
          return `激活活动: ${activityName}`;
        case OPERATION_TYPES.END_ACTIVITY:
          return `结束活动: ${activityName}`;
        default:
          return operationType;
      }
    },
    (req: Request, _res: Response, data: any) => {
      const activityId = req.params.id ||
        (data && JSON.parse(data).data && JSON.parse(data).data.activity && JSON.parse(data).data.activity.id);
      return {
        type: 'ACTIVITY',
        id: activityId
      };
    }
  );
};

/**
 * 记录奖品操作日志
 */
export const logPrizeOperation = (operationType: string) => {
  return logOperation(
    operationType,
    (req: Request, _res: Response, data: any) => {
      const prizeName = req.body.name ||
        (data && JSON.parse(data).data && JSON.parse(data).data.prize && JSON.parse(data).data.prize.name) ||
        '未知奖品';

      switch (operationType) {
        case OPERATION_TYPES.CREATE_PRIZE:
          return `创建奖品: ${prizeName}`;
        case OPERATION_TYPES.UPDATE_PRIZE:
          return `更新奖品: ${prizeName}`;
        case OPERATION_TYPES.DELETE_PRIZE:
          return `删除奖品: ${prizeName}`;
        default:
          return operationType;
      }
    },
    (req: Request, _res: Response, data: any) => {
      const prizeId = req.params.id ||
        (data && JSON.parse(data).data && JSON.parse(data).data.prize && JSON.parse(data).data.prize.id);
      return {
        type: 'PRIZE',
        id: prizeId
      };
    }
  );
};

/**
 * 记录抽奖码操作日志
 */
export const logLotteryCodeOperation = (operationType: string) => {
  return logOperation(
    operationType,
    (req: Request, _res: Response, _data: any) => {
      switch (operationType) {
        case OPERATION_TYPES.CREATE_LOTTERY_CODE:
          return `创建抽奖码: ${req.body.code}`;
        case OPERATION_TYPES.BATCH_CREATE_LOTTERY_CODE: {
          const count = req.body.count || 0;
          return `批量创建抽奖码: ${count}个`;
        }
        case OPERATION_TYPES.IMPORT_LOTTERY_CODE:
          return '导入抽奖码';
        case OPERATION_TYPES.UPDATE_LOTTERY_CODE:
          return '更新抽奖码信息';
        case OPERATION_TYPES.DELETE_LOTTERY_CODE:
          return '删除抽奖码';
        default:
          return operationType;
      }
    },
    (req: Request, _res: Response, _data: any) => {
      const activityId = req.params.id;
      return {
        type: 'ACTIVITY',
        id: activityId
      };
    }
  );
};

/**
 * 记录抽奖操作日志
 */
export const logLotteryDraw = (operationType: string) => {
  return logOperation(
    operationType,
    (_req: Request, _res: Response, data: any) => {
      try {
        const responseData = JSON.parse(data);
        const isWinner = responseData.data && responseData.data.is_winner;
        const prizeName = responseData.data && responseData.data.prize && responseData.data.prize.name;

        if (isWinner && prizeName) {
          return `${operationType === OPERATION_TYPES.ONLINE_LOTTERY ? '线上' : '线下'}抽奖中奖: ${prizeName}`;
        } else {
          return `${operationType === OPERATION_TYPES.ONLINE_LOTTERY ? '线上' : '线下'}抽奖未中奖`;
        }
      } catch (error) {
        return `${operationType === OPERATION_TYPES.ONLINE_LOTTERY ? '线上' : '线下'}抽奖`;
      }
    },
    (req: Request, _res: Response, _data: any) => {
      const activityId = req.params.id;
      return {
        type: 'ACTIVITY',
        id: activityId
      };
    }
  );
};

/**
 * 记录用户管理操作日志
 */
export const logUserOperation = (operationType: string) => {
  return logOperation(
    operationType,
    (req: Request, _res: Response, data: any) => {
      const username = req.body.username ||
        (data && JSON.parse(data).data && JSON.parse(data).data.user && JSON.parse(data).data.user.username) ||
        '未知用户';

      switch (operationType) {
        case OPERATION_TYPES.CREATE_USER:
          return `创建用户: ${username}`;
        case OPERATION_TYPES.UPDATE_USER:
          return `更新用户: ${username}`;
        case OPERATION_TYPES.DELETE_USER:
          return `删除用户: ${username}`;
        default:
          return operationType;
      }
    },
    (req: Request, _res: Response, data: any) => {
      const userId = req.params.id ||
        (data && JSON.parse(data).data && JSON.parse(data).data.user && JSON.parse(data).data.user.id);
      return {
        type: 'USER',
        id: userId
      };
    }
  );
};
