import type {
  User,
  Activity,
  Prize,
  LotteryCode,
  LotteryRecord,
  ApiResponse,
  ErrorResponse,
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest,
  CreateUserRequest,
  UpdateUserRequest,
  CreateActivityRequest,
  UpdateActivityRequest,
  UpdateActivityStatusRequest,
  DrawLotteryRequest,
  CreatePrizeRequest,
  UpdatePrizeRequest,
  AddLotteryCodeRequest,
  BatchAddLotteryCodesRequest,
  UserListParams,
  ActivityListParams,
  LotteryCodeListParams,
  LotteryRecordListParams,
  Pagination,
  DrawLotteryResponse,
  RegistrationStatus,
  MailConfig,
  UploadSignatureRequest,
  UploadSignatureResponse,
} from './types/api'

// API 基础配置
// 优先使用环境变量，其次使用默认值
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

// API 错误类
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: string,
    public status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// 获取认证 token
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

// 设置认证 token
export function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token)
}

// 清除认证 token
export function clearAuthToken(): void {
  localStorage.removeItem('auth_token')
}

// 基础 fetch 封装
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // 添加认证头
  if (requireAuth) {
    const token = getAuthToken()
    if (token) {
      Object.assign(headers, { Authorization: `Bearer ${token}` })
    }
  }

  const config: RequestInit = {
    ...options,
    headers,
  }

  try {
    const response = await fetch(url, config)

    if (!response.ok) {
      // 尝试解析错误响应
      let errorData: ErrorResponse
      try {
        errorData = await response.json()
      } catch {
        throw new ApiError(
          'NETWORK_ERROR',
          `HTTP ${response.status}: ${response.statusText}`,
          undefined,
          response.status,
        )
      }

      // 兼容两种后端错误格式：统一格式 error.message；
      // 旧校验格式顶层 message（笼统）+ errors 数组（具体说明，优先取首条）
      const firstFieldError = errorData.errors?.[0]?.msg || errorData.errors?.[0]?.message
      throw new ApiError(
        errorData.error?.code || 'UNKNOWN_ERROR',
        errorData.error?.message ||
          firstFieldError ||
          errorData.message ||
          'Unknown error occurred',
        errorData.error?.details,
        response.status,
      )
    }

    const data: ApiResponse<T> = await response.json()

    if (!data.success) {
      throw new ApiError('API_ERROR', data.message || 'API request failed')
    }

    return data.data as T
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    // 网络错误或其他错误
    throw new ApiError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network error occurred',
    )
  }
}

// 构建查询参数
function buildQueryParams(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value))
    }
  })

  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

// 认证模块 API
export const authApi = {
  // 用户登录
  async login(data: LoginRequest): Promise<{ token: string; user: User }> {
    return apiFetch(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      false,
    )
  },

  // 注册（公开接口：首位注册者成为超级管理员，此后按系统注册开关）
  async register(data: RegisterRequest): Promise<{ user: User }> {
    return apiFetch(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      false,
    )
  },

  // 注册开放状态（公开，决定前端是否展示注册入口）
  async registrationStatus(): Promise<RegistrationStatus> {
    return apiFetch('/auth/registration-status', {}, false)
  },

  // 发送注册邮箱验证码（公开）
  async sendCode(data: {
    email: string
    session: string
  }): Promise<{ sent: boolean; ttl_minutes: number }> {
    return apiFetch(
      '/auth/send-code',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      false,
    )
  },

  // 获取当前用户信息
  async me(): Promise<{ user: User }> {
    return apiFetch('/auth/me')
  },

  // 修改当前用户密码
  async changePassword(data: ChangePasswordRequest): Promise<void> {
    return apiFetch('/auth/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },
}

// 抽奖模块 API（公开接口）
export const lotteryApi = {
  // 获取活动抽奖信息
  async getActivity(id: number): Promise<{ activity: Activity; prizes: Prize[] }> {
    return apiFetch(`/lottery/activities/${id}`, {}, false)
  },

  // 用户使用抽奖码参与线上抽奖
  async draw(id: number, data: DrawLotteryRequest): Promise<DrawLotteryResponse> {
    return apiFetch(
      `/lottery/activities/${id}/draw`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      false,
    )
  },
}

// 系统管理模块 API
export const systemApi = {
  // 获取用户列表
  async getUsers(params: UserListParams = {}): Promise<{ users: User[]; pagination: Pagination }> {
    const queryString = buildQueryParams(
      params as Record<string, string | number | boolean | undefined>,
    )
    return apiFetch(`/system/users${queryString}`)
  },

  // 创建用户
  async createUser(data: CreateUserRequest): Promise<User> {
    return apiFetch('/system/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 获取用户详情
  async getUser(id: number): Promise<User> {
    return apiFetch(`/system/users/${id}`)
  },

  // 更新用户信息
  async updateUser(id: number, data: UpdateUserRequest): Promise<User> {
    return apiFetch(`/system/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // 更新用户状态
  async updateUserStatus(id: number, status: 'active' | 'inactive'): Promise<{ user: User }> {
    return apiFetch(`/system/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
  },

  // 删除用户
  async deleteUser(id: number): Promise<void> {
    return apiFetch(`/system/users/${id}`, {
      method: 'DELETE',
    })
  },

  // 系统注册开关（仅超级管理员）
  async getRegistration(): Promise<{ registration_enabled: boolean }> {
    return apiFetch('/system/registration')
  },

  async setRegistration(enabled: boolean): Promise<{ registration_enabled: boolean }> {
    return apiFetch('/system/registration', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    })
  },

  // 邮件通道配置（仅超级管理员）
  async getMail(): Promise<{ config: MailConfig | null }> {
    return apiFetch('/system/mail')
  },

  async setMail(
    data: Partial<MailConfig> & { postAuthToken?: string },
  ): Promise<{ config: MailConfig }> {
    return apiFetch('/system/mail', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // 发送测试邮件；config 传表单当前值（未保存版本），令牌留空沿用库中值
  async sendTestMail(
    to: string,
    config?: Partial<MailConfig> & { postAuthToken?: string },
  ): Promise<void> {
    return apiFetch('/system/mail/test', {
      method: 'POST',
      body: JSON.stringify({ to, config }),
    })
  },
}

// 管理员模块 - 活动管理 API
export const adminActivityApi = {
  // 获取活动列表
  async getActivities(
    params: ActivityListParams = {},
  ): Promise<{ activities: Activity[]; pagination: Pagination }> {
    const queryString = buildQueryParams(
      params as Record<string, string | number | boolean | undefined>,
    )
    return apiFetch(`/admin/activities${queryString}`)
  },

  // 创建活动
  async createActivity(data: CreateActivityRequest): Promise<{ activity: Activity }> {
    return apiFetch('/admin/activities', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 获取活动详情
  async getActivity(id: number): Promise<{ activity: Activity }> {
    return apiFetch(`/admin/activities/${id}`)
  },

  // 更新活动信息
  async updateActivity(id: number, data: UpdateActivityRequest): Promise<{ activity: Activity }> {
    return apiFetch(`/admin/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // 状态流转（受矩阵约束：draft→ready→active→ended，ready 可撤回）
  async updateActivityStatus(
    id: number,
    status: UpdateActivityStatusRequest['status'],
  ): Promise<{ activity: Activity }> {
    return apiFetch(`/admin/activities/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  // 删除活动
  async deleteActivity(id: number): Promise<void> {
    return apiFetch(`/admin/activities/${id}`, {
      method: 'DELETE',
    })
  },

  // 获取活动的抽奖码列表
  async getLotteryCodes(
    id: number,
    params: LotteryCodeListParams = {},
  ): Promise<{ lottery_codes: LotteryCode[]; pagination: Pagination }> {
    const queryString = buildQueryParams(
      params as Record<string, string | number | boolean | undefined>,
    )
    return apiFetch(`/admin/activities/${id}/lottery-codes${queryString}`)
  },

  // 单个添加抽奖码
  async addLotteryCode(
    id: number,
    data: AddLotteryCodeRequest,
  ): Promise<{ lottery_code: LotteryCode }> {
    return apiFetch(`/admin/activities/${id}/lottery-codes`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 批量添加抽奖码
  async batchAddLotteryCodes(
    id: number,
    data: BatchAddLotteryCodesRequest,
  ): Promise<{ lottery_codes: LotteryCode[] }> {
    return apiFetch(`/admin/activities/${id}/lottery-codes/batch`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 幂等获取（或创建）活动的测试抽奖码（不占 max_lottery_codes 配额）
  async ensureDemoCode(id: number): Promise<{ lottery_code: { id: number; code: string } }> {
    return apiFetch(`/admin/activities/${id}/lottery-codes/demo`, {
      method: 'POST',
    })
  },

  // 导出抽奖码
  async exportLotteryCodes(id: number, params: LotteryCodeListParams = {}): Promise<Blob> {
    const queryString = buildQueryParams(
      params as Record<string, string | number | boolean | undefined>,
    )
    const response = await fetch(
      `${API_BASE_URL}/admin/activities/${id}/lottery-codes/export${queryString}`,
      {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      },
    )

    if (!response.ok) {
      throw new ApiError('EXPORT_ERROR', 'Failed to export lottery codes')
    }

    return response.blob()
  },

  // 获取活动的抽奖记录
  async getLotteryRecords(
    id: number,
    params: LotteryRecordListParams = {},
  ): Promise<{ records: LotteryRecord[]; pagination: Pagination }> {
    const queryString = buildQueryParams(
      params as Record<string, string | number | boolean | undefined>,
    )
    return apiFetch(`/admin/activities/${id}/records${queryString}`)
  },

  // 导出抽奖记录
  async exportLotteryRecords(id: number, params: LotteryRecordListParams = {}): Promise<Blob> {
    const queryString = buildQueryParams(
      params as Record<string, string | number | boolean | undefined>,
    )
    const response = await fetch(
      `${API_BASE_URL}/admin/activities/${id}/lottery-records/export${queryString}`,
      {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      },
    )

    if (!response.ok) {
      throw new ApiError('EXPORT_ERROR', 'Failed to export lottery records')
    }

    return response.blob()
  },

  // 线下抽奖
  async offlineDraw(
    id: number,
    data: { lottery_code: string; prize_id?: number },
  ): Promise<DrawLotteryResponse> {
    return apiFetch(`/lottery/activities/${id}/offline-draw`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 上传签字（PNG data URL 直接存库）
  async uploadSignature(
    activityId: number,
    recordId: number,
    data: UploadSignatureRequest,
  ): Promise<UploadSignatureResponse> {
    return apiFetch(`/lottery/activities/${activityId}/records/${recordId}/signature`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
  // 获取签字图片（列表接口不返回大字段，预览时按需获取）
  async fetchSignature(activityId: number, recordId: number): Promise<UploadSignatureResponse> {
    return apiFetch(`/lottery/activities/${activityId}/records/${recordId}/signature`)
  },
}

// 管理员模块 - 奖品管理 API
export const adminPrizeApi = {
  // 获取活动的奖品列表
  async getPrizes(activityId: number): Promise<{ prizes: Prize[] }> {
    return apiFetch(`/admin/activities/${activityId}/prizes`)
  },

  // 创建奖品
  async createPrize(activityId: number, data: CreatePrizeRequest): Promise<{ prize: Prize }> {
    return apiFetch(`/admin/activities/${activityId}/prizes`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // 获取奖品详情
  async getPrize(activityId: number, prizeId: number): Promise<{ prize: Prize }> {
    return apiFetch(`/admin/activities/${activityId}/prizes/${prizeId}`)
  },

  // 更新奖品信息
  async updatePrize(
    activityId: number,
    prizeId: number,
    data: UpdatePrizeRequest,
  ): Promise<{ prize: Prize }> {
    return apiFetch(`/admin/activities/${activityId}/prizes/${prizeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  // 删除奖品
  async deletePrize(activityId: number, prizeId: number): Promise<void> {
    return apiFetch(`/admin/activities/${activityId}/prizes/${prizeId}`, {
      method: 'DELETE',
    })
  },
}

// 统计模块 API
export const statsApi = {
  // 获取仪表盘统计信息
  async getDashboardStats(): Promise<{
    totalActivities?: number
    totalLotteryCodes?: number
    totalAdmins?: number
    totalLotteryRecords?: number
    userActivities?: number
    userLotteryCodes?: number
    userLotteryRecords?: number
    totalUsers?: number
  }> {
    return apiFetch('/dashboard')
  },

  // 获取系统统计信息（已废弃，使用getDashboardStats代替）
  async getSystemStats(): Promise<{
    total_users: number
    total_activities: number
    total_lottery_codes: number
    total_lottery_records: number
  }> {
    // 为了向后兼容，调用新的dashboard接口并映射数据
    const dashboardData = await this.getDashboardStats()
    return {
      total_users: dashboardData.totalUsers || dashboardData.totalAdmins || 0,
      total_activities: dashboardData.totalActivities || dashboardData.userActivities || 0,
      total_lottery_codes: dashboardData.totalLotteryCodes || dashboardData.userLotteryCodes || 0,
      total_lottery_records:
        dashboardData.totalLotteryRecords || dashboardData.userLotteryRecords || 0,
    }
  },

  // 获取活动统计信息
  async getActivityStats(id: number): Promise<{
    total_lottery_codes: number
    used_lottery_codes: number
    total_lottery_records: number
    winner_records: number
    prizes_stats: Array<{
      prize_id: number
      prize_name: string
      total_quantity: number
      remaining_quantity: number
      winner_count: number
    }>
  }> {
    return apiFetch(`/admin/stats/activities/${id}`)
  },
}

// 导出所有 API
export const API = {
  auth: authApi,
  lottery: lotteryApi,
  system: systemApi,
  adminActivity: adminActivityApi,
  adminPrize: adminPrizeApi,
  stats: statsApi,
}

export default API
