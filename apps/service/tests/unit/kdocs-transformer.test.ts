// 金山表单（KDocs）webhook 载荷转换纯函数测试
// dist 为编译产物（无 .d.ts），保持 require 以获得宽松类型
const kdocsTransformer = require('../../dist/utils/kdocs-transformer')

const { DEFAULT_KDOCS_FIELD_MAP, resolveKdocsFieldMap, extractFieldValue, transformKdocsWebhook } =
  kdocsTransformer

/** 原中间件对接表单的完整载荷样例 */
const fullPayload = {
  rid: 'r-001',
  formId: 'form-001',
  formTitle: '迎新报名表',
  event: 'create_answer',
  eventTs: 1722844800000,
  answerContents: [
    { qid: 'k9ce0p', type: 'text', title: '姓名｜Name', value: '张三' },
    { qid: 'br1kvx', type: 'text', title: '学号｜Student ID', value: 20230001 },
    { qid: '30f4xe', type: 'email', title: 'UNNC邮箱｜UNNC Email', value: 'zhangsan@unnc.edu.cn' },
    { qid: '7wpvum', type: 'phone', title: '手机号｜Telephone Number', value: '13800138000' },
  ],
}

describe('kdocs-transformer', () => {
  describe('DEFAULT_KDOCS_FIELD_MAP', () => {
    it('与原中间件对接表单的 qid 一致', () => {
      expect(DEFAULT_KDOCS_FIELD_MAP).toEqual({
        name: 'k9ce0p',
        student_id: 'br1kvx',
        email: '30f4xe',
        phone: '7wpvum',
      })
    })
  })

  describe('resolveKdocsFieldMap', () => {
    it('未配置时返回默认映射', () => {
      expect(resolveKdocsFieldMap(undefined)).toEqual(DEFAULT_KDOCS_FIELD_MAP)
      expect(resolveKdocsFieldMap(null)).toEqual(DEFAULT_KDOCS_FIELD_MAP)
    })

    it('逐键覆盖：仅覆盖出现的键', () => {
      const resolved = resolveKdocsFieldMap({ student_id: 'aaaa' })
      expect(resolved.student_id).toBe('aaaa')
      expect(resolved.name).toBe(DEFAULT_KDOCS_FIELD_MAP.name)
    })

    it('空串 / 非字符串值回落默认', () => {
      expect(resolveKdocsFieldMap({ name: '', phone: 123 }).name).toBe(DEFAULT_KDOCS_FIELD_MAP.name)
      expect(resolveKdocsFieldMap({ name: '', phone: 123 }).phone).toBe(
        DEFAULT_KDOCS_FIELD_MAP.phone,
      )
    })

    it('值做 trim', () => {
      expect(resolveKdocsFieldMap({ email: '  xx01  ' }).email).toBe('xx01')
    })
  })

  describe('extractFieldValue', () => {
    it('数组值取第一个（单选题）', () => {
      const contents = [{ qid: 'q1', value: ['女', '男'] }]
      expect(extractFieldValue(contents, 'q1')).toBe('女')
    })

    it('未命中 qid 返回 null', () => {
      expect(extractFieldValue(fullPayload.answerContents, 'nope')).toBeNull()
    })
  })

  describe('transformKdocsWebhook', () => {
    it('默认映射提取全字段，学号字符串化为抽奖码', () => {
      const result = transformKdocsWebhook(fullPayload)
      expect(result.code).toBe('20230001')
      expect(result.participantInfo).toEqual({
        name: '张三',
        phone: '13800138000',
        email: 'zhangsan@unnc.edu.cn',
      })
      expect(result.missingFields).toEqual([])
    })

    it('自定义映射生效', () => {
      const payload = {
        event: 'create_answer',
        answerContents: [
          { qid: 'n1', value: '李四' },
          { qid: 's1', value: '20230002' },
          { qid: '30f4xe', value: 'lisi@unnc.edu.cn' },
        ],
      }
      const result = transformKdocsWebhook(
        payload,
        resolveKdocsFieldMap({ name: 'n1', student_id: 's1' }),
      )
      expect(result.code).toBe('20230002')
      expect(result.participantInfo.name).toBe('李四')
      // email 未被自定义，仍按默认 qid 提取
      expect(result.participantInfo.email).toBe('lisi@unnc.edu.cn')
      expect(result.missingFields).toEqual([])
    })

    it('缺姓名与学号 → missingFields 报中文名；手机/邮箱缺失不阻断', () => {
      const result = transformKdocsWebhook({
        event: 'create_answer',
        answerContents: [{ qid: '30f4xe', value: 'a@b.c' }],
      })
      expect(result.code).toBeNull()
      expect(result.missingFields).toEqual(['姓名', '学号'])
      expect(result.participantInfo.email).toBe('a@b.c')
    })

    it('answerContents 缺失 / 空数组 → 全部字段缺失', () => {
      expect(transformKdocsWebhook({ event: 'create_answer' }).missingFields).toEqual([
        '姓名',
        '学号',
      ])
      expect(
        transformKdocsWebhook({ event: 'create_answer', answerContents: [] }).missingFields,
      ).toEqual(['姓名', '学号'])
    })

    it('值做 trim，空白视为缺失', () => {
      const result = transformKdocsWebhook({
        event: 'create_answer',
        answerContents: [
          { qid: 'k9ce0p', value: '  王五  ' },
          { qid: 'br1kvx', value: ' 20230003 ' },
        ],
      })
      expect(result.participantInfo.name).toBe('王五')
      expect(result.code).toBe('20230003')
    })

    it('participantInfo 仅含提取到的字段', () => {
      const result = transformKdocsWebhook({
        event: 'create_answer',
        answerContents: [
          { qid: 'k9ce0p', value: '赵六' },
          { qid: 'br1kvx', value: '20230004' },
        ],
      })
      expect(Object.keys(result.participantInfo).sort()).toEqual(['name'])
    })
  })
})
