/**
 * 注册邮箱验证码（内存存储）：键 `${email}:${session}`，session 为客户端
 * 生成的流程令牌（多标签页并发注册互不冲突）。一次性、TTL 受邮件配置
 * 的 codeTtlMinutes 控制、错 5 次作废、恒时比较。
 * 单实例实现；重启即失效（用户重新获取即可）。
 */
import { timingSafeEqual } from 'crypto'

const MAX_ATTEMPTS = 5
const codes = new Map<string, { code: string; expiresAt: number; attempts: number }>()

interface LimitResult {
  allowed: boolean
  reason?: 'minute' | 'day'
  retryInSeconds?: number
}

/** 滑动窗口限频（email-poster 内置）：同 flow+目标 1/min、10/day */
const limiterPromise: Promise<{
  checkTarget: (flow: string, email: string) => LimitResult
}> = import('email-poster').then((m) => m.createEmailLimiter())

function limitMessage(r: LimitResult): string {
  if (r.reason === 'minute' && r.retryInSeconds) {
    return `发送过于频繁，请 ${Math.ceil(r.retryInSeconds / 60)} 分钟后再试`
  }
  return '发送过于频繁，今日额度已用尽，请明天再试'
}

export async function checkCodeSendLimit(
  email: string,
): Promise<{ allowed: boolean; message?: string }> {
  const limiter = await limiterPromise
  const r = limiter.checkTarget('code', email)
  return r.allowed ? { allowed: true } : { allowed: false, message: limitMessage(r) }
}

export async function checkTestSendLimit(
  userKey: string,
): Promise<{ allowed: boolean; message?: string }> {
  const limiter = await limiterPromise
  const r = limiter.checkTarget('test', userKey)
  return r.allowed ? { allowed: true } : { allowed: false, message: limitMessage(r) }
}

function key(email: string, session: string): string {
  return `${email}:${session}`
}

function sweep(now = Date.now()): void {
  for (const [k, v] of codes) if (v.expiresAt <= now) codes.delete(k)
}

export function issueCode(email: string, session: string, code: string, ttlMinutes: number): void {
  sweep()
  codes.set(key(email, session), {
    code,
    expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    attempts: 0,
  })
}

export function consumeCode(email: string, session: string, code: string): boolean {
  sweep()
  const k = key(email, session)
  const entry = codes.get(k)
  if (!entry) return false
  const a = Buffer.from(code)
  const b = Buffer.from(entry.code)
  const ok = a.length === b.length && timingSafeEqual(a, b)
  if (ok) {
    codes.delete(k)
    return true
  }
  entry.attempts += 1
  if (entry.attempts >= MAX_ATTEMPTS) codes.delete(k)
  return false
}
