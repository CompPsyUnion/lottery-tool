// 抽奖码 CSV 解析器单测（纯函数，位于 apps/web；解析器与后端逐行校验规则镜像）。
// web 源文件属 ESM 包（"type":"module"），CJS 测试工程下静态 import 会触发
// TS1479/TS6059 —— 用 require 规避（ts-jest 逐文件转译不受影响，同 dist require 模式）
const { parseLotteryCodeCsv } = require('../../../web/src/utils/lottery-code-csv')

const rowsOf = (result: { rows: Array<{ code: string }> }): string[] =>
  result.rows.map((r) => r.code)

describe('lottery-code-csv', () => {
  it('逗号分隔全字段解析 + 表头识别', () => {
    const result = parseLotteryCodeCsv(
      '抽奖码,姓名,手机,邮箱\n20230001,张三,13800138000,zhangsan@unnc.edu.cn\n20230002,李四,13900139000,lisi@unnc.edu.cn',
    )
    expect(result.hasHeader).toBe(true)
    expect(result.rows).toEqual([
      { code: '20230001', name: '张三', phone: '13800138000', email: 'zhangsan@unnc.edu.cn' },
      { code: '20230002', name: '李四', phone: '13900139000', email: 'lisi@unnc.edu.cn' },
    ])
    expect(result.errors).toEqual([])
  })

  it('英文表头 code 也识别；无表头直接数据行', () => {
    expect(parseLotteryCodeCsv('CODE,name\n20230001,张三').hasHeader).toBe(true)
    expect(parseLotteryCodeCsv('20230001,张三').hasHeader).toBe(false)
  })

  it('分号 / 制表符分隔嗅探', () => {
    expect(parseLotteryCodeCsv('20230001;张三;13800138000').separator).toBe(';')
    expect(parseLotteryCodeCsv('20230001\t张三\t13800138000').separator).toBe('\t')
    expect(parseLotteryCodeCsv('20230001;张三').rows[0].name).toBe('张三')
  })

  it('可选列：仅抽奖码 / 缺邮箱', () => {
    const result = parseLotteryCodeCsv('20230001\n20230002,李四,13800138000')
    expect(result.rows).toEqual([
      { code: '20230001' },
      { code: '20230002', name: '李四', phone: '13800138000' },
    ])
  })

  it('BOM 与 CRLF 容忍；空行跳过', () => {
    const text = '﻿抽奖码,姓名\r\n\r\n20230001,张三\r\n\r\n20230002,李四\r\n'
    const result = parseLotteryCodeCsv(text)
    expect(result.rows.map((r) => r.code)).toEqual(['20230001', '20230002'])
    expect(result.hasHeader).toBe(true)
  })

  it('逐行错误：缺码 / 码超长 / 手机 / 邮箱', () => {
    const result = parseLotteryCodeCsv(
      [
        ',缺码的行',
        '20230001,正常行',
        '1234567890123456789012345678901234567890123456789012345,码超50',
        '20230002,坏手机,12345',
        '20230003,坏邮箱,,not-an-email',
      ].join('\n'),
    )
    expect(rowsOf(result)).toEqual(['20230001'])
    expect(result.errors.map((e) => e.line)).toEqual([1, 3, 4, 5])
    expect(result.errors.map((e) => e.reason)).toEqual([
      '缺少抽奖码',
      '抽奖码超过50字符',
      '手机号格式不正确',
      '邮箱格式不正确',
    ])
  })

  it('超过 4 列忽略多余列', () => {
    const result = parseLotteryCodeCsv('20230001,张三,13800138000,a@b.c,多余1,多余2')
    expect(result.rows[0]).toEqual({
      code: '20230001',
      name: '张三',
      phone: '13800138000',
      email: 'a@b.c',
    })
  })

  it('文件内同码 last-wins 去重并计数', () => {
    const result = parseLotteryCodeCsv('20230001,张三\n20230002,李四\n20230001,张三丰')
    expect(result.duplicates).toBe(1)
    expect(result.rows).toEqual([
      { code: '20230001', name: '张三丰' },
      { code: '20230002', name: '李四' },
    ])
  })

  it('超过上限截断并标记', () => {
    const lines = Array.from({ length: 1200 }, (_, i) => `${10000000 + i}`)
    const result = parseLotteryCodeCsv(lines.join('\n'), { maxRows: 1000 })
    expect(result.rows.length).toBe(1000)
    expect(result.truncated).toBe(true)
    expect(result.errors.at(-1)?.reason).toContain('上限')
  })

  it('空输入返回空结果', () => {
    const result = parseLotteryCodeCsv('  \n \n')
    expect(result.rows).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.separator).toBe(',')
  })
})
