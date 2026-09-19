<template>
  <div class="space-y-6">
    <PageTitle
      :title="'抽奖码管理'"
      :sub-title="activityName ? `活动：${activityName}` : undefined"
    />

    <!-- 格式与配额提示 -->
    <div
      v-if="activity"
      class="flex items-center gap-2 text-sm rounded-md px-4 py-2.5 border bg-blue-50 border-blue-200 text-blue-800"
    >
      <Info class="h-4 w-4 shrink-0" />
      <span>
        抽奖码格式：{{ formatLabel }}；当前 {{ totalCount }} /
        {{ activity.settings?.max_lottery_codes || 1000 }} 个（导入超出配额将被整批拒绝）
      </span>
    </div>

    <!-- 概览数值卡片 -->
    <div class="grid md:grid-cols-4 grid-cols-1 gap-4">
      <NumberCard title="抽奖码总数" :value="totalCount" :icon="Ticket" />
      <NumberCard title="未使用" :value="unusedCount" :icon="Circle" />
      <NumberCard title="已使用" :value="usedCount" :icon="CheckCircle2" />
      <NumberCard title="已作废" :value="invalidCount" :icon="XCircle" />
    </div>

    <!-- 工具栏 -->
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-4 flex-wrap">
        <div class="relative">
          <Search
            class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4"
          />
          <Input
            v-model="searchQuery"
            placeholder="搜索抽奖码 / 姓名 / 手机 / 邮箱..."
            class="pl-10 w-72"
            @input="handleSearch"
          />
        </div>

        <Select v-model="statusFilter" @update:model-value="handleStatusFilter">
          <SelectTrigger class="w-32">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="unused">未使用</SelectItem>
            <SelectItem value="used">已使用</SelectItem>
            <SelectItem value="invalid">已作废</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <Button variant="outline" @click="openEditDialog(null)">
          <Plus class="h-4 w-4 mr-1" />
          新增
        </Button>
        <Button variant="outline" :disabled="exporting" @click="handleExport">
          <Download class="h-4 w-4 mr-1" />
          {{ exporting ? '导出中...' : '导出 CSV' }}
        </Button>
        <Button variant="outline" class="text-destructive" @click="openImportDialog('replace')">
          <RefreshCw class="h-4 w-4 mr-1" />
          覆盖导入
        </Button>
        <Button @click="openImportDialog('upsert')">
          <Upload class="h-4 w-4 mr-1" />
          导入
        </Button>
      </div>
    </div>

    <!-- 批量操作栏（有勾选时出现；选择跨页保留） -->
    <div
      v-if="selected.size > 0"
      class="flex items-center justify-between gap-4 flex-wrap rounded-md border bg-muted/40 px-4 py-2.5"
    >
      <div class="text-sm">
        已选 {{ selected.size }} 项
        <template v-if="selectedUsedCount > 0">
          ，<span class="text-red-600 font-medium"
            >含已使用 {{ selectedUsedCount }} 个（删除将连带
            {{ selectedRecordCount }} 条抽奖记录）</span
          >
        </template>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" @click="selected.clear()"> 清空选择 </Button>
        <Button variant="destructive" size="sm" @click="openDeleteConfirm(null)">
          <Trash class="h-4 w-4 mr-1" />
          删除选中
        </Button>
      </div>
    </div>

    <!-- 抽奖码列表（服务端分页） -->
    <DataTable
      :data="codes"
      :columns="columns"
      :loading="loading"
      :pagination="{
        current: currentPage,
        pageSize: pageSize,
        total: totalCount,
      }"
      :empty-text="'暂无抽奖码，点击右上角「导入」批量添加'"
      @page-change="handlePageChange"
    />

    <!-- 新增 / 编辑参与者信息 Dialog -->
    <Dialog :open="editOpen" @update:open="handleEditOpenChange">
      <DialogContent class="max-w-lg mx-4">
        <DialogHeader>
          <DialogTitle>{{ editingCode ? '编辑参与者信息' : '新增抽奖码' }}</DialogTitle>
          <DialogDescription>
            {{
              editingCode
                ? '修改该抽奖码的参与者信息，码本身与使用状态不可改'
                : `为活动「${activityName || ''}」添加单个抽奖码（${formatLabel}）`
            }}
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4" @submit="onEditSubmit">
          <FormField v-slot="{ componentField }" name="code">
            <FormItem>
              <FormLabel>抽奖码 {{ editingCode ? '' : '*' }}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  :disabled="!!editingCode"
                  placeholder="如：20230001"
                  class="font-mono"
                  v-bind="componentField"
                />
              </FormControl>
              <FormDescription> 须符合活动码格式（{{ formatLabel }}） </FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField v-slot="{ componentField }" name="name">
              <FormItem>
                <FormLabel>姓名</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="参与者姓名" v-bind="componentField" />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="phone">
              <FormItem>
                <FormLabel>手机号</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="11 位手机号" v-bind="componentField" />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
          </div>

          <FormField v-slot="{ componentField }" name="email">
            <FormItem>
              <FormLabel>邮箱</FormLabel>
              <FormControl>
                <Input type="text" placeholder="通知邮箱（可选）" v-bind="componentField" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <div class="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              :disabled="editSubmitting"
              @click="handleEditOpenChange(false)"
            >
              取消
            </Button>
            <Button type="submit" :disabled="editSubmitting">
              {{ editSubmitting ? '保存中...' : editingCode ? '保存修改' : '创建抽奖码' }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <!-- 导入 / 覆盖 Dialog -->
    <Dialog :open="importOpen" @update:open="handleImportOpenChange">
      <DialogContent class="max-w-2xl mx-4">
        <DialogHeader>
          <DialogTitle>{{
            importMode === 'replace' ? '覆盖导入抽奖码' : '导入抽奖码'
          }}</DialogTitle>
          <DialogDescription>
            每行「抽奖码,姓名,手机,邮箱」（逗号 / 分号 / Tab 分隔，后三列可空，支持表头行），
            单次最多 1000 行；Excel 请先另存为 CSV
          </DialogDescription>
        </DialogHeader>

        <!-- 结果视图（导入完成后） -->
        <div v-if="importResult" class="space-y-3">
          <p class="text-sm">
            {{ importMode === 'replace' ? '覆盖' : '导入' }}完成：新增
            <span class="font-medium text-green-700">{{ importResult.created_count }}</span>
            ，更新
            <span class="font-medium text-blue-700">{{ importResult.updated_count }}</span>
            <template v-if="importMode === 'replace'">
              ，删除 <span class="font-medium text-red-600">{{ importResult.deleted_count }}</span
              >（级联记录 {{ importResult.records_deleted }} 条）
            </template>
            ，失败
            <span class="font-medium text-red-600">{{ importResult.failed_rows.length }}</span>
          </p>
          <div
            v-if="importResult.failed_rows.length > 0"
            class="max-h-52 overflow-y-auto rounded-md border p-3 text-sm space-y-1"
          >
            <div v-for="(fail, i) in importResult.failed_rows" :key="i" class="text-red-600">
              第 {{ fail.row }} 行
              <template v-if="fail.code">（{{ fail.code }}）</template>
              ：{{ fail.reason }}
            </div>
          </div>
          <div class="flex justify-end">
            <Button @click="handleImportOpenChange(false)"> 完成 </Button>
          </div>
        </div>

        <!-- 输入 + 预览视图 -->
        <div v-else class="space-y-4">
          <!-- 覆盖模式警示 -->
          <div
            v-if="importMode === 'replace'"
            class="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800"
          >
            覆盖将先删除当前全部 <strong>{{ willDeleteCount }}</strong> 个未使用/已作废抽奖码
            （保留已使用与测试码），再按下方内容写入。此操作不可撤销，请确认。
          </div>

          <div class="grid gap-2">
            <Label>粘贴 CSV 文本</Label>
            <textarea
              v-model="csvText"
              rows="6"
              class="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
              placeholder="抽奖码,姓名,手机,邮箱&#10;20230001,张三,13800138000,zhangsan@unnc.edu.cn&#10;20230002,李四"
            ></textarea>
          </div>

          <div class="grid gap-2">
            <Label>或上传文件（.csv / .txt / .tsv）</Label>
            <input type="file" accept=".csv,.txt,.tsv" class="text-sm" @change="handleFileChange" />
          </div>

          <!-- 解析预览 -->
          <div v-if="csvText.trim()" class="space-y-2 rounded-md border p-3">
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span
                >有效 <strong>{{ parsed.rows.length }}</strong> 行</span
              >
              <span :class="parsed.errors.length ? 'text-red-600' : ''">
                错误 <strong>{{ parsed.errors.length }}</strong> 行
              </span>
              <span v-if="parsed.duplicates > 0" class="text-amber-600">
                文件内重复 <strong>{{ parsed.duplicates }}</strong> 行（按后行处理）
              </span>
              <span v-if="parsed.truncated" class="text-red-600">已超过 1000 行截断</span>
            </div>
            <div
              v-if="parsed.errors.length > 0"
              class="max-h-32 overflow-y-auto text-xs space-y-0.5"
            >
              <div v-for="(err, i) in parsed.errors.slice(0, 10)" :key="i" class="text-red-600">
                第 {{ err.line }} 行：{{ err.reason }}
              </div>
              <div v-if="parsed.errors.length > 10" class="text-muted-foreground">
                ...共 {{ parsed.errors.length }} 条错误
              </div>
            </div>
            <div v-if="parsed.rows.length > 0" class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="border-b text-left text-muted-foreground">
                    <th class="py-1 pr-3 font-normal">抽奖码</th>
                    <th class="py-1 pr-3 font-normal">姓名</th>
                    <th class="py-1 pr-3 font-normal">手机</th>
                    <th class="py-1 font-normal">邮箱</th>
                  </tr>
                </thead>
                <tbody class="font-mono">
                  <tr v-for="(row, i) in parsed.rows.slice(0, 10)" :key="i" class="border-b">
                    <td class="py-1 pr-3">{{ row.code }}</td>
                    <td class="py-1 pr-3">{{ row.name || '-' }}</td>
                    <td class="py-1 pr-3">{{ row.phone || '-' }}</td>
                    <td class="py-1">{{ row.email || '-' }}</td>
                  </tr>
                  <tr v-if="parsed.rows.length > 10">
                    <td colspan="4" class="py-1 text-muted-foreground">
                      ...共 {{ parsed.rows.length }} 行
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="flex justify-end gap-3">
            <Button
              variant="outline"
              :disabled="importSubmitting"
              @click="handleImportOpenChange(false)"
            >
              取消
            </Button>
            <Button
              :variant="importMode === 'replace' ? 'destructive' : 'default'"
              :disabled="importDisabled || importSubmitting"
              @click="handleImportSubmit"
            >
              {{
                importSubmitting
                  ? '提交中...'
                  : importMode === 'replace'
                    ? `覆盖导入（先删 ${willDeleteCount} 个）`
                    : `导入 ${parsed.rows.length} 行`
              }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- 删除确认 Dialog（单个 / 批量，含已使用与级联记录警示） -->
    <Dialog :open="deleteConfirmOpen" @update:open="(v: boolean) => (deleteConfirmOpen = v)">
      <DialogContent class="max-w-md mx-4">
        <DialogHeader>
          <DialogTitle class="text-red-600">确认删除抽奖码</DialogTitle>
        </DialogHeader>
        <div class="text-sm space-y-2">
          <p>
            将删除 <strong>{{ deleteTargetCount }}</strong> 个抽奖码
            <template v-if="deleteTargetUsedCount > 0">
              ，其中<strong class="text-red-600">已使用 {{ deleteTargetUsedCount }} 个</strong>
            </template>
            。
          </p>
          <p v-if="deleteTargetRecordCount > 0" class="text-red-600">
            这些码关联的
            <strong>{{ deleteTargetRecordCount }} 条抽奖记录（含签字）</strong
            >将被一并删除，不可恢复！
          </p>
          <p v-else class="text-muted-foreground">删除后不可恢复。</p>
        </div>
        <div class="flex justify-end gap-3">
          <Button variant="outline" :disabled="deleteSubmitting" @click="deleteConfirmOpen = false">
            取消
          </Button>
          <Button variant="destructive" :disabled="deleteSubmitting" @click="handleDeleteConfirm">
            {{ deleteSubmitting ? '删除中...' : '确认删除' }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRoute } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { toast } from 'vue-sonner'
import {
  Ticket,
  Circle,
  CheckCircle2,
  XCircle,
  Plus,
  Info,
  SquarePen,
  Trash,
  Upload,
  Download,
  RefreshCw,
  Search,
} from 'lucide-vue-next'

import PageTitle from '@/components/ui/text/pageTitle.vue'
import NumberCard from '@/components/admin/dashboard/numberCard.vue'
import DataTable from '@/components/common/DataTable.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { API } from '@/api'
import { parseLotteryCodeCsv } from '@/utils/lottery-code-csv'
import { setActivityName } from '@/composables/useBreadcrumb'
import type { Activity, LotteryCode, ImportLotteryCodesResponse } from '@/types/api'
import type { TableColumn } from '@/components/common/types'

const route = useRoute()
const activityId = Number(route.params.id)

// ==================== 状态 ====================
const activity = ref<Activity | null>(null)
const codes = ref<LotteryCode[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const totalCount = ref(0)
const searchQuery = ref('')
const statusFilter = ref('all')

// 状态计数（NumberCards；各一次 limit=1 的轻查询取 total）
const unusedCount = ref(0)
const usedCount = ref(0)
const invalidCount = ref(0)

// 勾选态：跨页保留，key 为码 id
const selected = ref(new Map<number, LotteryCode>())

// 编辑 / 新增弹窗
const editOpen = ref(false)
const editingCode = ref<LotteryCode | null>(null)
const editSubmitting = ref(false)

// 导入 / 覆盖弹窗
const importOpen = ref(false)
const importMode = ref<'upsert' | 'replace'>('upsert')
const importSubmitting = ref(false)
const csvText = ref('')
const importResult = ref<ImportLotteryCodesResponse | null>(null)
const willDeleteUnused = ref(0)
const willDeleteInvalid = ref(0)

// 删除确认弹窗（单删 target 非空；批删为 null 用选中集）
const deleteConfirmOpen = ref(false)
const deleteSubmitting = ref(false)
const deleteSingleTarget = ref<LotteryCode | null>(null)

// 导出
const exporting = ref(false)

// ==================== 计算属性 ====================
const activityName = computed(() => activity.value?.name || '')

const FORMAT_LABELS: Record<string, string> = {
  '4_digit_number': '4位数字',
  '8_digit_number': '8位数字',
  '8_digit_alphanumeric': '8位字母数字',
  '12_digit_number': '12位数字',
  '12_digit_alphanumeric': '12位字母数字',
}
const formatLabel = computed(
  () =>
    FORMAT_LABELS[activity.value?.settings?.lottery_code_format || '8_digit_number'] || '8位数字',
)

const selectedUsedCount = computed(
  () => [...selected.value.values()].filter((c) => c.status === 'used').length,
)
const selectedRecordCount = computed(() =>
  [...selected.value.values()].reduce((sum, c) => sum + (c.record_count || 0), 0),
)

const willDeleteCount = computed(() => willDeleteUnused.value + willDeleteInvalid.value)

const parsed = computed(() => parseLotteryCodeCsv(csvText.value))
const importDisabled = computed(
  () => parsed.value.rows.length === 0 && importMode.value === 'upsert',
)

const deleteTargetList = computed(() =>
  deleteSingleTarget.value ? [deleteSingleTarget.value] : [...selected.value.values()],
)
const deleteTargetCount = computed(() => deleteTargetList.value.length)
const deleteTargetUsedCount = computed(
  () => deleteTargetList.value.filter((c) => c.status === 'used').length,
)
const deleteTargetRecordCount = computed(() =>
  deleteTargetList.value.reduce((sum, c) => sum + (c.record_count || 0), 0),
)

// 统一按钮 class（沿用活动列表操作按钮样式）
const actionBtnCls =
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8'
const actionBtnDangerCls =
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground text-destructive h-8 w-8'

// ==================== 表格列 ====================
const columns = computed<TableColumn[]>(() => [
  {
    key: 'selection',
    title: h('input', {
      type: 'checkbox',
      class: 'h-4 w-4 accent-blue-600 cursor-pointer',
      checked: codes.value.length > 0 && codes.value.every((c) => selected.value.has(c.id)),
      onChange: (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked
        for (const code of codes.value) {
          if (checked) selected.value.set(code.id, code)
          else selected.value.delete(code.id)
        }
      },
    }),
    width: '40px',
    align: 'center',
    render: (_value: unknown, record: Record<string, unknown>) => {
      const code = record as unknown as LotteryCode
      return h('input', {
        type: 'checkbox',
        class: 'h-4 w-4 accent-blue-600 cursor-pointer',
        checked: selected.value.has(code.id),
        onClick: (e: Event) => {
          const checked = (e.target as HTMLInputElement).checked
          if (checked) selected.value.set(code.id, code)
          else selected.value.delete(code.id)
        },
      })
    },
  },
  {
    key: 'code',
    title: '抽奖码',
    width: '130px',
    render: (value: unknown) => `<span class="font-mono font-medium">${value}</span>`,
  },
  {
    key: 'status',
    title: '状态',
    width: '80px',
    align: 'center',
    render: (value: unknown) => {
      const status = value as LotteryCode['status']
      const meta: Record<string, { label: string; cls: string }> = {
        unused: { label: '未使用', cls: 'bg-blue-50 text-blue-700' },
        used: { label: '已使用', cls: 'bg-green-50 text-green-700' },
        invalid: { label: '已作废', cls: 'bg-red-50 text-red-700' },
      }
      const m = meta[status] || meta.unused
      return `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}">${m.label}</span>`
    },
  },
  {
    key: 'participant_info',
    title: '参与者',
    minWidth: '160px',
    render: (_value: unknown, record: Record<string, unknown>) => {
      const code = record as unknown as LotteryCode
      const info = code.participant_info
      if (!info) return '<span class="text-muted-foreground">-</span>'
      const lines: string[] = []
      if (info.name) lines.push(`<span>${info.name}</span>`)
      if (info.phone) lines.push(`<span class="text-muted-foreground">${info.phone}</span>`)
      if (info.email) lines.push(`<span class="text-muted-foreground">${info.email}</span>`)
      return `<div class="space-y-0.5 text-sm">${lines.join('')}</div>`
    },
  },
  {
    key: 'record_count',
    title: '记录数',
    width: '70px',
    align: 'center',
    render: (value: unknown) => {
      const n = (value as number) ?? 0
      return `<span class="${n > 0 ? 'font-medium' : 'text-muted-foreground'}">${n}</span>`
    },
  },
  {
    key: 'used_at',
    title: '使用时间',
    width: '150px',
    render: (value: unknown) => {
      if (!value) return '<span class="text-muted-foreground">-</span>'
      return new Date(value as string).toLocaleString('zh-CN')
    },
  },
  {
    key: 'created_at',
    title: '创建时间',
    width: '150px',
    render: (value: unknown) => new Date(value as string).toLocaleString('zh-CN'),
  },
  {
    key: 'actions',
    title: '操作',
    width: '90px',
    align: 'center',
    render: (_value: unknown, record: Record<string, unknown>) => {
      const code = record as unknown as LotteryCode
      return h('div', { class: 'flex items-center justify-center gap-2' }, [
        h(
          'button',
          { class: actionBtnCls, title: '编辑参与者信息', onClick: () => openEditDialog(code) },
          [h(SquarePen, { size: 16 })],
        ),
        h(
          'button',
          {
            class: actionBtnDangerCls,
            title: '删除抽奖码',
            onClick: () => openDeleteConfirm(code),
          },
          [h(Trash, { size: 16, color: 'red' })],
        ),
      ])
    },
  },
])

// ==================== 数据加载 ====================
const fetchActivity = async () => {
  try {
    const response = await API.adminActivity.getActivity(activityId)
    activity.value = response.activity
    setActivityName(response.activity?.name || '')
  } catch {
    activity.value = null
  }
}

const fetchCodes = async () => {
  loading.value = true
  try {
    const response = await API.adminActivity.getLotteryCodes(activityId, {
      page: currentPage.value,
      limit: pageSize.value,
      search: searchQuery.value || undefined,
      status:
        statusFilter.value === 'all' ? undefined : (statusFilter.value as LotteryCode['status']),
    })
    codes.value = response.lottery_codes
    totalCount.value = response.pagination.total
  } catch {
    codes.value = []
    totalCount.value = 0
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  try {
    const [total, unused, used, invalid] = await Promise.all([
      API.adminActivity.getLotteryCodes(activityId, { limit: 1 }),
      API.adminActivity.getLotteryCodes(activityId, { limit: 1, status: 'unused' }),
      API.adminActivity.getLotteryCodes(activityId, { limit: 1, status: 'used' }),
      API.adminActivity.getLotteryCodes(activityId, { limit: 1, status: 'invalid' }),
    ])
    totalCount.value = total.pagination.total
    unusedCount.value = unused.pagination.total
    usedCount.value = used.pagination.total
    invalidCount.value = invalid.pagination.total
  } catch {
    // 统计失败不阻塞列表
  }
}

const refresh = async () => {
  await Promise.all([fetchCodes(), fetchStats()])
}

// ==================== 交互 ====================
const handleSearch = useDebounceFn(() => {
  currentPage.value = 1
  fetchCodes()
}, 400)

const handleStatusFilter = () => {
  currentPage.value = 1
  fetchCodes()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchCodes()
}

// ---- 新增 / 编辑 ----
const phoneSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^1[3-9]\d{9}$/.test(v), '手机号格式不正确')
const emailSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), '邮箱格式不正确')

const editFormSchema = toTypedSchema(
  z.object({
    code: z.string().trim().min(1, '请输入抽奖码').max(50, '抽奖码不能超过50个字符'),
    name: z.string().trim().max(100, '姓名不能超过100个字符'),
    phone: phoneSchema,
    email: emailSchema,
  }),
)

const editForm = useForm({
  validationSchema: editFormSchema,
  initialValues: { code: '', name: '', phone: '', email: '' },
})

const openEditDialog = (code: LotteryCode | null) => {
  editingCode.value = code
  editForm.resetForm({
    values: {
      code: code?.code || '',
      name: code?.participant_info?.name || '',
      phone: code?.participant_info?.phone || '',
      email: code?.participant_info?.email || '',
    },
  })
  editOpen.value = true
}

const handleEditOpenChange = (open: boolean) => {
  editOpen.value = open
  if (!open) editingCode.value = null
}

const onEditSubmit = editForm.handleSubmit(async (values) => {
  editSubmitting.value = true
  try {
    const participant_info = {
      ...(values.name ? { name: values.name } : {}),
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.email ? { email: values.email } : {}),
    }

    if (editingCode.value) {
      await API.adminActivity.updateLotteryCodeParticipantInfo(activityId, editingCode.value.id, {
        participant_info,
      })
      toast.success('参与者信息已更新')
    } else {
      await API.adminActivity.addLotteryCode(activityId, {
        code: values.code,
        participant_info,
      })
      toast.success('抽奖码创建成功')
    }

    editOpen.value = false
    editingCode.value = null
    await refresh()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '保存失败，请稍后重试')
  } finally {
    editSubmitting.value = false
  }
})

// ---- 导入 / 覆盖 ----
const openImportDialog = async (mode: 'upsert' | 'replace') => {
  importMode.value = mode
  csvText.value = ''
  importResult.value = null
  importOpen.value = true

  if (mode === 'replace') {
    // 预取将被删除的数量（当前 unused + invalid 业务码）
    try {
      const [unused, invalid] = await Promise.all([
        API.adminActivity.getLotteryCodes(activityId, { limit: 1, status: 'unused' }),
        API.adminActivity.getLotteryCodes(activityId, { limit: 1, status: 'invalid' }),
      ])
      willDeleteUnused.value = unused.pagination.total
      willDeleteInvalid.value = invalid.pagination.total
    } catch {
      willDeleteUnused.value = 0
      willDeleteInvalid.value = 0
    }
  }
}

const handleImportOpenChange = (open: boolean) => {
  importOpen.value = open
  if (!open) {
    // 关闭（含结果视图）后刷新，反映导入结果
    if (importResult.value) refresh()
    importResult.value = null
    csvText.value = ''
  }
}

const handleFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    csvText.value = String(reader.result || '')
    // 允许重复选择同一文件再次触发
    ;(e.target as HTMLInputElement).value = ''
  }
  reader.readAsText(file)
}

const handleImportSubmit = async () => {
  // 覆盖模式：解析无错误行才允许提交（避免带错行误覆盖）
  if (importMode.value === 'replace' && parsed.value.errors.length > 0) {
    toast.error('请先修正错误行再覆盖（错误行不会被导入，但覆盖删除会照常执行）')
    return
  }

  importSubmitting.value = true
  try {
    const result = await API.adminActivity.importLotteryCodes(activityId, {
      codes: parsed.value.rows,
      mode: importMode.value,
    })
    importResult.value = result
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '导入失败，请稍后重试')
  } finally {
    importSubmitting.value = false
  }
}

// ---- 删除 ----
const openDeleteConfirm = (code: LotteryCode | null) => {
  deleteSingleTarget.value = code
  deleteConfirmOpen.value = true
}

const handleDeleteConfirm = async () => {
  const ids = deleteTargetList.value.map((c) => c.id)
  if (ids.length === 0) return

  deleteSubmitting.value = true
  try {
    const result = await API.adminActivity.batchDeleteLotteryCodes(activityId, { ids })
    const failed = result.results.filter((r) => !r.success)
    if (result.summary.deleted > 0) {
      toast.success(
        `已删除 ${result.summary.deleted} 个抽奖码${
          result.summary.records_deleted > 0
            ? `（级联删除 ${result.summary.records_deleted} 条记录）`
            : ''
        }`,
      )
    }
    if (failed.length > 0) toast.warning(`${failed.length} 个未删除：${failed[0].message} 等`)

    deleteConfirmOpen.value = false
    deleteSingleTarget.value = null
    selected.value.clear()
    await refresh()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除失败，请稍后重试')
  } finally {
    deleteSubmitting.value = false
  }
}

// ---- 导出 ----
const handleExport = async () => {
  exporting.value = true
  try {
    const blob = await API.adminActivity.exportLotteryCodes(activityId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lottery_codes_${activityId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '导出失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}

// ==================== 初始化 ====================
onMounted(() => {
  fetchActivity()
  refresh()
})
</script>
