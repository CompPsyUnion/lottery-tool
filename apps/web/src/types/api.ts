// API 类型定义
export interface User {
  id: number
  username: string
  email: string
  role: 'super_admin' | 'admin'
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export type ActivityStatus = 'draft' | 'ready' | 'active' | 'ended'

/** 金山表单（KDocs）字段映射：表单题目 qid → 抽奖字段（未配置用系统默认） */
export interface KdocsFieldMap {
  name?: string
  student_id?: string
  email?: string
  phone?: string
}

/** 活动设置（settings jsonb） */
export interface ActivitySettings {
  max_lottery_codes?: number
  lottery_code_format?:
    | '4_digit_number'
    | '8_digit_number'
    | '8_digit_alphanumeric'
    | '12_digit_number'
    | '12_digit_alphanumeric'
  allow_duplicate_phone?: boolean
  require_signature?: boolean
  lottery_strategy?: 'probability' | 'guaranteed'
  /** 金山表单接入（可选）：字段 qid 映射 / 绑定验证码 / 报名成功邮件通知 */
  kdocs_field_map?: KdocsFieldMap
  kdocs_bind_code?: string
  kdocs_notify?: boolean
}

/** 活动 Webhook 接入信息（GET /admin/activities/:id/webhook-info） */
export interface ActivityWebhookInfo {
  /** 批量添加抽奖码端点（请求头 Authorization: Bearer <token>） */
  webhook_url: string
  /** 金山表单端点（token 已拼在查询参数，可直接粘贴到表单 webhook 配置） */
  kdocs_url: string
  webhook_token: string
  activity_id: string
}

export interface Activity {
  id: number
  name: string
  description?: string
  icon?: string
  status: ActivityStatus
  lottery_mode: 'offline' | 'online'
  start_time?: string
  end_time?: string
  settings?: ActivitySettings
  created_at: string
  lottery_codes_count?: number
  remaining_lottery_codes?: number
  used_lottery_codes?: number
  prizes?: Prize[]
}

export interface Prize {
  id: number
  activity_id?: number
  name: string
  description?: string | null
  total_quantity: number
  remaining_quantity: number
  /** 后端 numeric 列经 pg 驱动返回字符串，使用前请 Number()/parseFloat 转换 */
  probability: number | string
  sort_order?: number | null
  created_at?: string
  updated_at?: string
}

export interface LotteryCode {
  id: number
  code: string
  status: 'unused' | 'used'
  /** 测试抽奖码（一活动至多一个，抽奖不产生副作用） */
  is_test?: boolean
  participant_info?: {
    name: string
    phone: string
    email?: string
  }
  used_at?: string
  created_at: string
}

export interface LotteryRecord {
  id: number
  activity_id: number
  lottery_code_id: number
  prize_id?: number
  is_winner: boolean
  operator_id?: number
  ip_address?: string
  user_agent?: string
  signed_at?: string
  signature_status?: 'unsigned' | 'signed'
  created_at: string
  lotteryCode: string
  phone?: string
  email?: string
  name?: string
  prize?: string | Prize
  operator?: string
  lottery_code?: LotteryCode
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}

export interface ErrorResponse {
  success: false
  /** 统一错误格式（errorHandler）：error.code/message/details */
  error?: {
    code: string
    message: string
    details?: string
  }
  /** 部分路由校验分支的旧格式：顶层 message + errors 数组 */
  message?: string
  errors?: { msg?: string; message?: string }[]
}

// 请求参数类型
export interface LoginRequest {
  username: string
  password: string
}

export interface MailConfig {
  postUrl: string
  postFieldMap: string
  postPreset: 'none' | 'smtogo' | 'generic' | 'custom_example'
  fromAddress: string
  codeTtlMinutes: number
  codeSubject: string
  hasToken: boolean
}

export interface RegistrationStatus {
  registration_enabled: boolean
  initialized: boolean
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
  role?: 'admin' | 'super_admin'
}

export interface ChangePasswordRequest {
  old_password: string
  new_password: string
}

export interface CreateUserRequest {
  username: string
  email: string
  password: string
  role: 'admin' | 'super_admin'
}

export interface UpdateUserRequest {
  username?: string
  email?: string
  role?: 'admin' | 'super_admin'
  status?: 'active' | 'inactive'
}

export interface CreateActivityRequest {
  name: string
  description?: string
  lottery_mode: 'offline' | 'online'
  start_time?: string
  end_time?: string
  settings?: ActivitySettings
}

export interface UpdateActivityRequest {
  name?: string
  description?: string
  start_time?: string
  end_time?: string
  /** 键级合并：仅覆盖出现的键，未出现的保留库中现值 */
  settings?: Partial<ActivitySettings>
}

/** 状态流转走专用端点 PATCH /admin/activities/:id/status（受流转矩阵约束） */
export interface UpdateActivityStatusRequest {
  status: ActivityStatus
}

export interface DrawLotteryRequest {
  lottery_code: string
  participant_info: {
    name: string
    phone: string
    email?: string
  }
}

export interface CreatePrizeRequest {
  name: string
  description?: string
  total_quantity: number
  probability: number
  sort_order?: number
}

export interface UpdatePrizeRequest {
  name?: string
  description?: string
  total_quantity?: number
  probability?: number
  sort_order?: number
}

export interface AddLotteryCodeRequest {
  code?: string
  participant_info?: {
    name: string
    phone: string
    email?: string
  }
}

export interface BatchAddLotteryCodesRequest {
  count: number
  participant_infos?: Array<{
    name: string
    phone: string
    email?: string
  }>
}

// 查询参数类型
export interface PaginationParams {
  page?: number
  limit?: number
}

export interface SearchParams extends PaginationParams {
  search?: string
}

export interface UserListParams extends SearchParams {
  role?: 'admin' | 'super_admin'
  status?: 'active' | 'inactive'
}

export interface ActivityListParams extends SearchParams {
  status?: ActivityStatus
  lottery_mode?: 'offline' | 'online'
}

export interface LotteryCodeListParams extends SearchParams {
  status?: 'unused' | 'used'
  has_participant_info?: boolean
}

export interface LotteryRecordListParams extends PaginationParams {
  is_winner?: boolean
  start_date?: string
  end_date?: string
  keyword?: string
}

// 抽奖响应类型
export interface DrawLotteryResponse {
  is_winner: boolean
  /** 测试码测试抽奖：不扣库存、不写记录 */
  is_demo?: boolean
  prize?: Prize
  /** demo 抽奖不产生记录，为 null */
  lottery_record: LotteryRecord | null
  lottery_code: LotteryCode
}

// 签字上传（PNG data URL）
export interface UploadSignatureRequest {
  image: string
}

export interface UploadSignatureResponse {
  record_id: number
  signature_status?: 'unsigned' | 'signed'
  signature_data?: string
  signed_at?: string
}

// i18n 相关类型
export type Locale = 'en-US' | 'zh-CN'

export interface I18nConfig {
  locale: Locale
  fallbackLocale: Locale
  messages: Record<Locale, Record<string, string | Record<string, string>>>
}
