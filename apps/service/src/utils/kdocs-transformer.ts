/**
 * 金山表单（KDocs）webhook 载荷转换：独立中间件 Lottery-Tool-Middleware 内嵌化。
 * 纯函数、无 DB 依赖；鉴权 / 落库 / 邮件通知由路由层负责。
 */

/** 金山表单 webhook 的单条答案 */
export interface KdocsAnswerContent {
  qid: string
  type?: string
  title?: string
  value: unknown
}

/** 金山表单 webhook 载荷（本地最小结构，多余字段容忍） */
export interface KdocsWebhookPayload {
  rid?: string
  formId?: string
  formTitle?: string
  event?: string
  eventTs?: number
  answerContents?: KdocsAnswerContent[]
}

/** 表单字段 → 抽奖字段的 qid 映射 */
export interface KdocsFieldMap {
  /** 参与者姓名 */
  name: string
  /** 学号（作为抽奖码） */
  student_id: string
  /** 邮箱（通知邮件收件人） */
  email: string
  /** 手机号 */
  phone: string
}

/** 默认字段映射：原中间件对接的 UNNC 表单 qid，未配置时零配置可用 */
export const DEFAULT_KDOCS_FIELD_MAP: KdocsFieldMap = {
  name: 'k9ce0p',
  student_id: 'br1kvx',
  email: '30f4xe',
  phone: '7wpvum',
}

/** 字段中文名（缺字段报错提示用） */
const FIELD_LABELS: Record<keyof KdocsFieldMap, string> = {
  name: '姓名',
  student_id: '学号',
  email: '邮箱',
  phone: '手机号',
}

/** 活动配置覆盖默认映射（逐键；非字符串或空白回落默认值） */
export function resolveKdocsFieldMap(
  custom?: Partial<Record<keyof KdocsFieldMap, unknown>>,
): KdocsFieldMap {
  const merged: KdocsFieldMap = { ...DEFAULT_KDOCS_FIELD_MAP }
  if (custom && typeof custom === 'object') {
    for (const key of Object.keys(DEFAULT_KDOCS_FIELD_MAP) as (keyof KdocsFieldMap)[]) {
      const value = custom[key]
      if (typeof value === 'string' && value.trim() !== '') {
        merged[key] = value.trim()
      }
    }
  }
  return merged
}

/** 按 qid 提取字段值；数组值取第一个（如单选题） */
export function extractFieldValue(answerContents: KdocsAnswerContent[], qid: string): unknown {
  for (const content of answerContents) {
    if (content?.qid === qid) {
      const value = content.value
      if (Array.isArray(value) && value.length > 0) return value[0]
      return value
    }
  }
  return null
}

export interface KdocsTransformResult {
  /** 抽奖码（学号字符串化）；缺少学号时为 null */
  code: string | null
  /** 参与者信息（仅含提取到的字段） */
  participantInfo: { name?: string; phone?: string; email?: string }
  /** 缺失的必填字段中文名（姓名 / 学号） */
  missingFields: string[]
}

/**
 * 转换金山表单载荷为抽奖码 + 参与者信息。
 * 必填：姓名、学号；手机号 / 邮箱尽力提取（邮箱缺失仅影响通知邮件，不阻断）。
 */
export function transformKdocsWebhook(
  payload: KdocsWebhookPayload,
  fieldMap: KdocsFieldMap = DEFAULT_KDOCS_FIELD_MAP,
): KdocsTransformResult {
  const contents = Array.isArray(payload?.answerContents) ? payload.answerContents : []
  const pick = (qid: string): string | null => {
    const value = extractFieldValue(contents, qid)
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text === '' ? null : text
  }

  const name = pick(fieldMap.name)
  const studentId = pick(fieldMap.student_id)
  const phone = pick(fieldMap.phone)
  const email = pick(fieldMap.email)

  const missingFields: string[] = []
  if (!name) missingFields.push(FIELD_LABELS.name)
  if (!studentId) missingFields.push(FIELD_LABELS.student_id)

  const participantInfo: KdocsTransformResult['participantInfo'] = {}
  if (name) participantInfo.name = name
  if (phone) participantInfo.phone = phone
  if (email) participantInfo.email = email

  return { code: studentId, participantInfo, missingFields }
}
