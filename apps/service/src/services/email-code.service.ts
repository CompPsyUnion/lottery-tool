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

/**
 * 邮箱即抽单独限频：10s/封（token bucket：容量 1、每秒回 0.1 个 = 发一次后
 * 需等 10 秒才有下一个令牌）+ 每日上限（默认 10 封）防邮件轰炸。
 * 每日维度复用 createEmailLimiter（per-minute 提到 60 使其分钟限制不再生效）；
 * 注册验证码（code）与测试邮件仍走上面 1/min 实例。
 */
const emailDrawLimiterPromise: Promise<{
  checkTarget: (flow: string, email: string) => LimitResult
}> = import('email-poster').then((m) => m.createEmailLimiter({ targetPerMinute: 60 }))

/** 每邮箱一个 10s 令牌桶（email-poster 原语）；24h 未用即清扫，防 Map 无限增长 */
const drawBucketsPromise: Promise<{
  buckets: Map<string, { tryTake: () => boolean; lastAt: number }>
  make: () => { tryTake: () => boolean }
}> = import('email-poster').then((m) => ({
  buckets: new Map(),
  make: () =>
    m.tokenBucket({ capacity: 1, refillPerSec: 0.1 }) as {
      tryTake: () => boolean
    },
}))

const DRAW_BUCKET_TTL_MS = 24 * 60 * 60 * 1000

function pruneDrawBuckets(buckets: Map<string, { tryTake: () => boolean; lastAt: number }>): void {
  if (buckets.size < 5000) return
  const now = Date.now()
  for (const [k, v] of buckets) if (now - v.lastAt > DRAW_BUCKET_TTL_MS) buckets.delete(k)
}

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

/** 邮箱即抽确认邮件的发送频控（10s/封 + 每日上限） */
export async function checkEmailDrawSendLimit(
  email: string,
): Promise<{ allowed: boolean; message?: string }> {
  const { buckets, make } = await drawBucketsPromise
  pruneDrawBuckets(buckets)
  let bucket = buckets.get(email)
  if (!bucket) {
    bucket = { tryTake: make().tryTake, lastAt: Date.now() }
    buckets.set(email, bucket)
  }
  if (!bucket.tryTake()) {
    return { allowed: false, message: '发送过于频繁，请 10 秒后再试' }
  }
  bucket.lastAt = Date.now()

  const limiter = await emailDrawLimiterPromise
  const r = limiter.checkTarget('emaildraw', email)
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
