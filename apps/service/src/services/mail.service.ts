import { AppDataSource } from '../utils/database'
import { SystemSetting } from '../entities/system-setting.entity'
import { renderTestMail } from '../utils/mail-theme'

const MAIL_CONFIG_KEY = 'mail_config'

export type MailPreset = 'none' | 'smtogo' | 'generic' | 'custom_example'

/** email-poster FieldMap：逻辑字段 → 下游键（本地最小结构，避免 ESM 类型导入） */
type FieldMap = Record<string, string>

/** 邮件通道配置（POST webhook 形式，无 SMTP），存 SystemSetting 键值表 */
export interface MailConfig {
  postUrl: string
  postAuthToken: string
  /** email-poster FieldMap JSON；空串 = 使用 preset 预设 */
  postFieldMap: string
  postPreset: MailPreset
  fromAddress: string
  /** 验证码有效期（分钟） */
  codeTtlMinutes: number
  codeSubject: string
}

/** 默认配置（测试发送在库中无配置时以此兜底） */
export const DEFAULT_CONFIG: MailConfig = {
  postUrl: '',
  postAuthToken: '',
  postFieldMap: '',
  postPreset: 'smtogo',
  fromAddress: '',
  codeTtlMinutes: 10,
  codeSubject: '您的验证码',
}

export async function getMailConfig(): Promise<MailConfig | null> {
  const setting = await AppDataSource.getRepository(SystemSetting).findOneBy({
    key: MAIL_CONFIG_KEY,
  })
  if (!setting) return null
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(setting.value) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/** 表单补丁合并：普通字段覆盖；token 留空不覆盖（与 gateway 密码语义一致，保存与测试发送共用） */
export function mergeMailConfigPatch(current: MailConfig, patch: Partial<MailConfig>): MailConfig {
  const { postAuthToken, ...rest } = patch
  const merged: MailConfig = { ...current, ...rest }
  if (typeof postAuthToken === 'string' && postAuthToken !== '') {
    merged.postAuthToken = postAuthToken
  }
  return merged
}

/** token 留空不覆盖（与 gateway 密码语义一致：保存时无需重填密钥） */
export async function saveMailConfig(patch: Partial<MailConfig>): Promise<MailConfig> {
  const repo = AppDataSource.getRepository(SystemSetting)
  const current = (await getMailConfig()) ?? { ...DEFAULT_CONFIG }
  const merged = mergeMailConfigPatch(current, patch)
  await repo.save({ key: MAIL_CONFIG_KEY, value: JSON.stringify(merged) })
  return merged
}

/** 返回给前端的形态：剥离 token，暴露 hasToken */
export function mailConfigToClient(c: MailConfig | null) {
  if (!c) return null
  return {
    postUrl: c.postUrl,
    postFieldMap: c.postFieldMap,
    postPreset: c.postPreset,
    fromAddress: c.fromAddress,
    codeTtlMinutes: c.codeTtlMinutes,
    codeSubject: c.codeSubject,
    hasToken: c.postAuthToken !== '',
  }
}

export interface SendMailInput {
  to: string
  subject: string
  body: string
  html?: boolean
}

// email-poster 为纯 ESM 包：CJS 产物下以动态 import 加载（tsc 编译为 require 动态调用）
const emailPosterModule: Promise<{
  EmailPoster: new (config: unknown) => { send: (input: unknown) => Promise<{ messageId: string }> }
  PRESETS: Record<MailPreset, FieldMap>
}> = import('email-poster')

async function resolveFieldMap(c: MailConfig): Promise<FieldMap> {
  const raw = c.postFieldMap?.trim()
  if (raw) {
    try {
      return JSON.parse(raw) as FieldMap
    } catch {
      throw new Error('字段映射 JSON 解析失败，请检查配置')
    }
  }
  const { PRESETS } = await emailPosterModule
  return PRESETS[c.postPreset]
}

/** 通过 email-poster 以 POST webhook 发送；错误消息原样抛出 */
export async function sendMail(c: MailConfig, input: SendMailInput): Promise<string> {
  if (!c.postUrl) throw new Error('邮件通道未配置（缺少 webhook 地址）')

  const { EmailPoster } = await emailPosterModule
  const poster = new EmailPoster({
    postUrl: c.postUrl,
    preset: 'none',
    fields: await resolveFieldMap(c),
    fromAddress: c.fromAddress || undefined,
    headers: c.postAuthToken ? { Authorization: `Bearer ${c.postAuthToken}` } : {},
    retry: { maxAttempts: 1 },
    recipients: { serialize: 'comma' },
    parseMessageId: false,
    limits: {
      maxLenRecipientEmail: 254,
      maxLenSubject: 500,
      maxLenBody: 1_000_000,
    },
  })

  try {
    const { messageId } = await poster.send({
      to: input.to,
      subject: input.subject,
      body: input.body,
      type: input.html ? 'html' : 'text',
    })
    return messageId
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Webhook 发送失败')
  }
}

/** 发送测试邮件（超管在设置页验证通道连通性；内置 card 模板，贴合站点主题） */
export async function sendTestMail(c: MailConfig, to: string): Promise<string> {
  return sendMail(c, {
    to,
    subject: 'Lottery Tool 邮件通道测试',
    body: await renderTestMail(),
    html: true,
  })
}
