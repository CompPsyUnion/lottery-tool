// API 类型定义
export interface User {
  id: number;
  username: string;
  email: string;
  role: 'super_admin' | 'admin';
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  status: 'draft' | 'active' | 'ended';
  lottery_mode: 'offline' | 'online';
  start_time?: string;
  end_time?: string;
  settings?: {
    max_lottery_codes?: number;
    lottery_code_format?: '4_digit_number' | '8_digit_number' | '8_digit_alphanumeric' | '12_digit_number' | '12_digit_alphanumeric';
    allow_duplicate_phone?: boolean;
    require_signature?: boolean;
    lottery_strategy?: 'probability' | 'guaranteed';
  };
  created_at: string;
  lottery_codes_count?: number;
  remaining_lottery_codes?: number;
  used_lottery_codes?: number;
  prizes?: Prize[];
}

export interface Prize {
  id: number;
  activity_id?: number;
  name: string;
  description?: string | null;
  total_quantity: number;
  remaining_quantity: number;
  /** 后端 numeric 列经 pg 驱动返回字符串，使用前请 Number()/parseFloat 转换 */
  probability: number | string;
  sort_order?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface LotteryCode {
  id: number;
  code: string;
  status: 'unused' | 'used';
  participant_info?: {
    name: string;
    phone: string;
    email?: string;
  };
  used_at?: string;
  created_at: string;
}

export interface LotteryRecord {
  id: number;
  activity_id: number;
  lottery_code_id: number;
  prize_id?: number;
  is_winner: boolean;
  operator_id?: number;
  ip_address?: string;
  user_agent?: string;
  signed_at?: string;
  signature_status?: 'unsigned' | 'signed';
  created_at: string;
  lotteryCode: string;
  phone?: string;
  email?: string;
  name?: string;
  prize?: string | Prize;
  operator?: string;
  lottery_code?: LotteryCode;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

// 请求参数类型
export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'super_admin';
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'super_admin';
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  role?: 'admin' | 'super_admin';
  status?: 'active' | 'inactive';
}

export interface CreateActivityRequest {
  name: string;
  description?: string;
  lottery_mode: 'offline' | 'online';
  start_time?: string;
  end_time?: string;
  settings?: {
    max_lottery_codes?: number;
    lottery_code_format?: '4_digit_number' | '8_digit_number' | '8_digit_alphanumeric' | '12_digit_number' | '12_digit_alphanumeric';
    allow_duplicate_phone?: boolean;
    require_signature?: boolean;
    lottery_strategy?: 'probability' | 'guaranteed';
  };
}

export interface UpdateActivityRequest {
  name?: string;
  description?: string;
  status?: 'draft' | 'active' | 'ended';
  start_time?: string;
  end_time?: string;
}

export interface DrawLotteryRequest {
  lottery_code: string;
  participant_info: {
    name: string;
    phone: string;
    email?: string;
  };
}

export interface CreatePrizeRequest {
  name: string;
  description?: string;
  total_quantity: number;
  probability: number;
  sort_order?: number;
}

export interface UpdatePrizeRequest {
  name?: string;
  description?: string;
  total_quantity?: number;
  probability?: number;
  sort_order?: number;
}

export interface AddLotteryCodeRequest {
  code?: string;
  participant_info?: {
    name: string;
    phone: string;
    email?: string;
  };
}

export interface BatchAddLotteryCodesRequest {
  count: number;
  participant_infos?: Array<{
    name: string;
    phone: string;
    email?: string;
  }>;
}

// 查询参数类型
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface SearchParams extends PaginationParams {
  search?: string;
}

export interface UserListParams extends SearchParams {
  role?: 'admin' | 'super_admin';
  status?: 'active' | 'inactive';
}

export interface ActivityListParams extends SearchParams {
  status?: 'draft' | 'active' | 'ended';
  lottery_mode?: 'offline' | 'online';
}

export interface LotteryCodeListParams extends SearchParams {
  status?: 'unused' | 'used';
  has_participant_info?: boolean;
}

export interface LotteryRecordListParams extends PaginationParams {
  is_winner?: boolean;
  start_date?: string;
  end_date?: string;
  keyword?: string;
}

// 抽奖响应类型
export interface DrawLotteryResponse {
  is_winner: boolean;
  prize?: Prize;
  lottery_record: LotteryRecord;
  lottery_code: LotteryCode;
}

// COS 配置类型
export interface UploadSignatureRequest {
  image: string;
}

export interface UploadSignatureResponse {
  record_id: number;
  signature_status?: 'unsigned' | 'signed';
  signature_data?: string;
  signed_at?: string;
}

// i18n 相关类型
export type Locale = 'en-US' | 'zh-CN';

export interface I18nConfig {
  locale: Locale;
  fallbackLocale: Locale;
  messages: Record<Locale, Record<string, string | Record<string, string>>>;
}