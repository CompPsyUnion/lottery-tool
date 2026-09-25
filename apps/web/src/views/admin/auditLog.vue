<template>
  <div class="space-y-6">
    <PageTitle :title="'审计日志'" :sub-title="'奖品库存 / 抽奖码数量变动与操作者记录'" />

    <!-- 筛选栏 -->
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-4 flex-wrap">
        <div class="relative">
          <Search
            class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4"
          />
          <Input
            v-model="codeQuery"
            placeholder="搜索抽奖码..."
            class="pl-10 w-56"
            @input="handleSearch"
          />
        </div>

        <Select v-model="activityFilter" @update:model-value="handleFilter">
          <SelectTrigger class="w-56">
            <SelectValue placeholder="全部活动" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部活动</SelectItem>
            <SelectItem v-for="a in activities" :key="a.id" :value="String(a.id)">
              {{ a.name }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="actionFilter" @update:model-value="handleFilter">
          <SelectTrigger class="w-44">
            <SelectValue placeholder="全部动作" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部动作</SelectItem>
            <SelectItem v-for="(label, key) in ACTION_LABELS" :key="key" :value="key">
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="text-sm text-muted-foreground">共 {{ total }} 条</div>
    </div>

    <!-- 审计列表（服务端分页） -->
    <DataTable
      :data="logs"
      :columns="columns"
      :loading="loading"
      :pagination="{
        current: currentPage,
        pageSize: pageSize,
        total,
      }"
      :empty-text="'暂无审计记录'"
      @page-change="handlePageChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Search } from 'lucide-vue-next'

import PageTitle from '@/components/ui/text/pageTitle.vue'
import DataTable from '@/components/common/DataTable.vue'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { API } from '@/api'
import type { Activity, AuditLog, AuditListParams } from '@/types/api'
import type { TableColumn } from '@/components/common/types'

// 动作类型中文标签（与后端 AUDIT_ACTIONS 对齐）
const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  DRAW_ONLINE: { label: '线上抽奖', cls: 'bg-blue-50 text-blue-700' },
  DRAW_OFFLINE: { label: '线下抽奖', cls: 'bg-indigo-50 text-indigo-700' },
  DRAW_TEST: { label: '测试抽奖', cls: 'bg-gray-100 text-gray-600' },
  UNDO_DRAW: { label: '撤销抽奖', cls: 'bg-amber-50 text-amber-700' },
  RECORD_DELETE: { label: '删除记录', cls: 'bg-orange-50 text-orange-700' },
  PRIZE_CREATE: { label: '新增奖品', cls: 'bg-green-50 text-green-700' },
  PRIZE_UPDATE: { label: '更新奖品', cls: 'bg-teal-50 text-teal-700' },
  PRIZE_DELETE: { label: '删除奖品', cls: 'bg-red-50 text-red-700' },
  CODE_CREATE: { label: '新增抽奖码', cls: 'bg-cyan-50 text-cyan-700' },
  CODE_IMPORT: { label: '导入抽奖码', cls: 'bg-sky-50 text-sky-700' },
  CODE_REPLACE: { label: '覆盖抽奖码', cls: 'bg-purple-50 text-purple-700' },
  CODE_DELETE: { label: '删除抽奖码', cls: 'bg-rose-50 text-rose-700' },
}

// 状态
const logs = ref<AuditLog[]>([])
const activities = ref<Activity[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const codeQuery = ref('')
const activityFilter = ref('all')
const actionFilter = ref('all')

// 表格列
const columns: TableColumn[] = [
  {
    key: 'created_at',
    title: '时间',
    width: '160px',
    render: (value: unknown) => new Date(value as string).toLocaleString('zh-CN'),
  },
  {
    key: 'action',
    title: '动作',
    width: '110px',
    render: (value: unknown) => {
      const meta = ACTION_LABELS[value as string] || {
        label: String(value),
        cls: 'bg-gray-100 text-gray-600',
      }
      return `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}">${meta.label}</span>`
    },
  },
  {
    key: 'lottery_code',
    title: '抽奖码',
    width: '120px',
    render: (value: unknown) =>
      value
        ? `<span class="font-mono text-xs">${value}</span>${''}`
        : '<span class="text-muted-foreground">-</span>',
  },
  {
    key: 'prize_name',
    title: '奖品',
    width: '160px',
    render: (_value: unknown, record: Record<string, unknown>) => {
      const log = record as unknown as AuditLog
      if (!log.prize_name) return '<span class="text-muted-foreground">-</span>'
      const desc = log.prize_description?.trim()
      // 描述快照：第二行灰字截断展示，悬停看全文（历史已删奖品无描述，仅剩名）
      const descLine = desc
        ? `<p class="text-xs text-muted-foreground leading-snug line-clamp-2" title="${desc.replace(/"/g, '&quot;')}">${desc}</p>`
        : ''
      // id 快照：名后小字标注（奖品已删时仍可凭 id 在备份/导出中溯源）
      const idTag = log.prize_id
        ? ` <span class="text-[10px] text-muted-foreground/70">#${log.prize_id}</span>`
        : ''
      return `<div class="space-y-0.5"><span>${log.prize_name}</span>${idTag}${descLine}</div>`
    },
  },
  {
    key: 'quantity_before',
    title: '操作前',
    width: '90px',
    align: 'center',
    render: (_v: unknown, record: Record<string, unknown>) => {
      const log = record as unknown as AuditLog
      if (log.quantity_before === null || log.quantity_before === undefined) {
        return '<span class="text-muted-foreground">-</span>'
      }
      const unit = String(log.action ?? '').startsWith('CODE_') ? ' 码' : ''
      return `<span class="tabular-nums" title="${String(log.action ?? '').startsWith('CODE_') ? '操作前抽奖码总数' : '操作前该奖品剩余库存'}">${log.quantity_before}${unit}</span>`
    },
  },
  {
    key: 'quantity_after',
    title: '操作后',
    width: '100px',
    align: 'center',
    render: (_v: unknown, record: Record<string, unknown>) => {
      const log = record as unknown as AuditLog
      const d = log.delta ?? 0
      const color = d < 0 ? 'text-red-600' : d > 0 ? 'text-green-600' : 'text-muted-foreground'
      const unit = String(log.action ?? '').startsWith('CODE_') ? ' 码' : ''
      // 前后均有值：数值 + 变化量；旧数据只有 delta（码类早期记录）：仅显示净变化
      if (log.quantity_after !== null && log.quantity_after !== undefined) {
        return `<span class="tabular-nums" title="操作后${String(log.action ?? '').startsWith('CODE_') ? '抽奖码总数' : '该奖品剩余库存'}">${log.quantity_after}${unit} <span class="font-medium ${color}">(${d > 0 ? '+' : ''}${d})</span></span>`
      }
      if (d !== 0) {
        return `<span class="font-medium ${color}">${d > 0 ? '+' : ''}${d}${unit || ' 码'}</span>`
      }
      return '<span class="text-muted-foreground">-</span>'
    },
  },
  {
    key: 'actor',
    title: '操作者',
    width: '150px',
    render: (_v: unknown, record: Record<string, unknown>) => {
      const log = record as unknown as AuditLog
      if (!log.actor) return '<span class="text-muted-foreground">-</span>'
      const typeLabel: Record<string, string> = {
        admin: '管理员',
        participant: '参与者',
        email: '邮箱',
        system: '系统',
      }
      const badge = typeLabel[log.actor_type] || log.actor_type
      return `<div class="text-sm"><span>${log.actor}</span> <span class="text-xs text-muted-foreground">（${badge}）</span></div>`
    },
  },
  {
    key: 'is_test',
    title: '测试',
    width: '60px',
    align: 'center',
    render: (value: unknown) =>
      value
        ? '<span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">测试</span>'
        : '<span class="text-muted-foreground">-</span>',
  },
  {
    key: 'detail',
    title: '说明',
    minWidth: '180px',
    render: (value: unknown) =>
      value
        ? `<span class="text-muted-foreground text-xs" title="${String(value).replace(/"/g, '&quot;')}">${value}</span>`
        : '-',
  },
]

// 数据加载
const fetchLogs = async () => {
  loading.value = true
  try {
    const res = await API.adminAudit.list({
      page: currentPage.value,
      limit: pageSize.value,
      code: codeQuery.value || undefined,
      activity_id: activityFilter.value === 'all' ? undefined : Number(activityFilter.value),
      action:
        actionFilter.value === 'all'
          ? undefined
          : (actionFilter.value as AuditListParams['action']),
    })
    logs.value = res.logs
    total.value = res.pagination.total
  } catch {
    logs.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const fetchActivities = async () => {
  try {
    const res = await API.adminActivity.getActivities({ limit: 100 })
    activities.value = res.activities
  } catch {
    activities.value = []
  }
}

// 交互
const handleSearch = useDebounceFn(() => {
  currentPage.value = 1
  fetchLogs()
}, 400)

const handleFilter = () => {
  currentPage.value = 1
  fetchLogs()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchLogs()
}

onMounted(() => {
  fetchActivities()
  fetchLogs()
})
</script>
