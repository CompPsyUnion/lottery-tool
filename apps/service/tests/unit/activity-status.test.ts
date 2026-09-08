// dist 为编译产物（无 .d.ts），保持 require 以获得宽松类型
const activityService = require('../../dist/services/activity.service')
const scheduler = require('../../dist/services/activity-status-scheduler')

const baseActivity = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: '测试活动',
  lottery_mode: 'online',
  start_time: null,
  end_time: null,
  status: 'draft',
  settings: null,
  ...over,
})

describe('活动状态机', () => {
  describe('canTransition 流转矩阵', () => {
    const cases: Array<[string, string, boolean]> = [
      // draft → 只能发布为 ready
      ['draft', 'ready', true],
      ['draft', 'active', false],
      ['draft', 'ended', false],
      ['draft', 'draft', false],
      // ready → 可撤回 draft / 立即开始 active；不可直接结束
      ['ready', 'draft', true],
      ['ready', 'active', true],
      ['ready', 'ended', false],
      ['ready', 'ready', false],
      // active → 只能结束
      ['active', 'ended', true],
      ['active', 'draft', false],
      ['active', 'ready', false],
      ['active', 'active', false],
      // ended → 终态不可逆
      ['ended', 'draft', false],
      ['ended', 'ready', false],
      ['ended', 'active', false],
      ['ended', 'ended', false],
    ]

    it.each(cases)('%s → %s 应为 %s', (from, to, allowed) => {
      expect(activityService.canTransition(from, to)).toBe(allowed)
    })
  })

  describe('getActivityOpenState 开放判定', () => {
    const past = new Date(Date.now() - 60_000)
    const future = new Date(Date.now() + 60_000)

    it('draft/ready 未开始', () => {
      expect(activityService.getActivityOpenState(baseActivity({ status: 'draft' }))).toEqual({
        open: false,
        message: '活动未开始',
      })
      expect(activityService.getActivityOpenState(baseActivity({ status: 'ready' }))).toEqual({
        open: false,
        message: '活动未开始',
      })
    })

    it('ended 已结束', () => {
      expect(activityService.getActivityOpenState(baseActivity({ status: 'ended' }))).toEqual({
        open: false,
        message: '活动已结束',
      })
    })

    it('active 且无时间限制 → 开放（null 安全）', () => {
      expect(activityService.getActivityOpenState(baseActivity({ status: 'active' }))).toEqual({
        open: true,
      })
    })

    it('active 未到 start_time → 未开始', () => {
      expect(
        activityService.getActivityOpenState(
          baseActivity({ status: 'active', start_time: future }),
        ),
      ).toEqual({ open: false, message: '活动未开始' })
    })

    it('active 已过 end_time → 已结束', () => {
      expect(
        activityService.getActivityOpenState(baseActivity({ status: 'active', end_time: past })),
      ).toEqual({ open: false, message: '活动已结束' })
    })

    it('active 在时间窗内 → 开放', () => {
      expect(
        activityService.getActivityOpenState(
          baseActivity({ status: 'active', start_time: past, end_time: future }),
        ),
      ).toEqual({ open: true })
    })
  })

  describe('scheduler 导出', () => {
    it('应导出流转与启停函数', () => {
      expect(typeof scheduler.transitionDueActivities).toBe('function')
      expect(typeof scheduler.startScheduler).toBe('function')
      expect(typeof scheduler.stopScheduler).toBe('function')
    })
  })
})

export {}
