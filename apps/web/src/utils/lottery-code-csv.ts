/**
 * 抽奖码批量导入 CSV 解析（纯函数，无 DOM/Vue 依赖，便于跨包单测）。
 * 格式：每行「抽奖码,姓名,手机,邮箱」，分隔符支持逗号/分号/制表符，
 * 后三列可空，首行可为表头（抽奖码/code）。与后端逐行校验规则保持一致。
 */

export interface CsvRow {
  code: string
  name?: string
  phone?: string
  email?: string
}

export interface CsvRowError {
  /** 1 起始的原始行号（含被跳过的表头行） */
  line: number
  reason: string
}

export interface ParseResult {
  rows: CsvRow[]
  errors: CsvRowError[]
  /** 文件内同码 last-wins 去重丢弃的行数 */
  duplicates: number
  separator: ',' | ';' | '\t'
  hasHeader: boolean
  /** 超过上限被截断 */
  truncated: boolean
}

const MOBILE_RE = /^1[3-9]\d{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DEFAULT_MAX_ROWS = 1000

/** 分隔符嗅探：取全文出现频次最高者（并列时逗号 > 制表符 > 分号） */
function sniffSeparator(text: string): ',' | ';' | '\t' {
  const counts: Array<{ sep: ',' | ';' | '\t'; n: number }> = [
    { sep: ',', n: 0 },
    { sep: '\t', n: 0 },
    { sep: ';', n: 0 },
  ]
  for (const ch of text) {
    const hit = counts.find((c) => c.sep === ch)
    if (hit) hit.n++
  }
  counts.sort((a, b) => b.n - a.n)
  return counts[0].sep
}

export function parseLotteryCodeCsv(text: string, opts?: { maxRows?: number }): ParseResult {
  const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS
  const result: ParseResult = {
    rows: [],
    errors: [],
    duplicates: 0,
    separator: ',',
    hasHeader: false,
    truncated: false,
  }

  const cleaned = (text ?? '').replace(/^\uFEFF/, '')
  if (cleaned.trim() === '') return result

  result.separator = sniffSeparator(cleaned)
  const lines = cleaned.split(/\r\n|\r|\n/)

  // 可选表头：首个非空行首格为 抽奖码/code（大小写不敏感）则跳过
  let startIdx = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    const firstCell = lines[i].split(result.separator)[0]?.trim().toLowerCase()
    if (firstCell === '抽奖码' || firstCell === 'code') {
      result.hasHeader = true
      startIdx = i + 1
    }
    break
  }

  // 同码 last-wins（后行视为修正），保留原始行号
  const seen = new Map<string, { line: number; row: CsvRow }>()

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    const lineNo = i + 1

    // 超过单次导入上限：截断并提示（不再继续解析剩余行）
    if (seen.size + 1 > maxRows) {
      result.truncated = true
      result.errors.push({
        line: lineNo,
        reason: `超过单次导入上限 ${maxRows} 行，已截断`,
      })
      break
    }

    const cells = line.split(result.separator).map((c) => c.trim())
    const [code = '', name = '', phone = '', email = ''] = cells

    if (!code) {
      result.errors.push({ line: lineNo, reason: '缺少抽奖码' })
      continue
    }
    if (code.length > 50) {
      result.errors.push({ line: lineNo, reason: '抽奖码超过50字符' })
      continue
    }
    if (name.length > 100) {
      result.errors.push({ line: lineNo, reason: '姓名超过100字符' })
      continue
    }
    if (phone && !MOBILE_RE.test(phone)) {
      result.errors.push({ line: lineNo, reason: '手机号格式不正确' })
      continue
    }
    if (email && !EMAIL_RE.test(email)) {
      result.errors.push({ line: lineNo, reason: '邮箱格式不正确' })
      continue
    }

    const row: CsvRow = {
      code,
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
    }

    if (seen.has(code)) {
      // 同码 last-wins：计为重复（信息性计数，不算错误），后行覆盖前行
      result.duplicates += 1
    }
    seen.set(code, { line: lineNo, row })
  }

  result.rows = [...seen.values()].map((v) => v.row)
  return result
}
