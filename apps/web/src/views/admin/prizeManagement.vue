<template>
  <div class="space-y-6">
    <PageTitle :title="'奖品管理'" :sub-title="activityName ? `活动：${activityName}` : undefined" />

    <!-- 抽奖策略提示 -->
    <div
      v-if="activity"
      class="flex items-center gap-2 text-sm rounded-md px-4 py-2.5 border"
      :class="strategyClass"
    >
      <Info class="h-4 w-4 shrink-0" />
      <span>{{ strategyHint }}</span>
    </div>

    <!-- 概览数值卡片 -->
    <div class="grid md:grid-cols-4 grid-cols-1 gap-4">
      <NumberCard title="奖品种数" :value="prizeTypeCount" :icon="Gift" />
      <NumberCard title="奖品总库存" :value="totalPrizes" :icon="Package" />
      <NumberCard title="剩余库存" :value="remainingPrizes" :icon="Layers" />
      <NumberCard title="已中出数量" :value="awardedPrizes" :icon="Trophy" />
    </div>

    <!-- 操作栏 -->
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="text-sm text-muted-foreground">
        共 {{ prizes.length }} 个奖品
        <template v-if="strategy !== 'guaranteed'">
          ，概率总和 {{ (probabilityTotal * 100).toFixed(2) }}%<span
            v-if="probabilityTotal > 1"
            class="text-red-600 font-medium"
            >（超过 100%，需调整）</span>
        </template>
      </div>
      <Button @click="openCreateDialog">
        <Plus class="h-4 w-4 mr-2" />
        新增奖品
      </Button>
    </div>

    <!-- 奖品列表 -->
    <DataTable
      :data="prizes"
      :columns="columns"
      :loading="loading"
      :show-pagination="false"
      :empty-text="'暂无奖品，点击右上角「新增奖品」开始配置'"
    />

    <!-- 新增 / 编辑奖品 Dialog -->
    <Dialog :open="dialogOpen" @update:open="handleDialogOpenChange">
      <DialogContent class="max-w-lg mx-4">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? '编辑奖品' : '新增奖品' }}</DialogTitle>
          <DialogDescription>
            {{
              isEditing
                ? '修改奖品信息，保存后立即生效'
                : `为活动「${activityName || ''}」添加新奖品`
            }}
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4" @submit="onSubmit">
          <FormField v-slot="{ componentField }" name="name">
            <FormItem>
              <FormLabel>奖品名称 *</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="请输入奖品名称，如：一等奖·iPhone 16"
                  v-bind="componentField"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="description">
            <FormItem>
              <FormLabel>奖品描述</FormLabel>
              <FormControl>
                <textarea
                  class="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="奖品说明（可选），不超过500字"
                  v-bind="componentField"
                ></textarea>
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField v-slot="{ componentField }" name="total_quantity">
              <FormItem>
                <FormLabel>奖品总数量 *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="如：10"
                    v-bind="componentField"
                  />
                </FormControl>

                <FormMessage />
              </FormItem>
            </FormField>

            <FormField v-slot="{ componentField }" name="sort_order">
              <FormItem>
                <FormLabel>排序值</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="数字越小越靠前"
                    v-bind="componentField"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
          </div>

          <p class="text-muted-foreground text-sm">奖品总库存，剩余数量随已中出数量自动扣减</p>

          <FormField v-slot="{ componentField }" name="probability">
            <FormItem>
              <FormLabel>中奖概率（%）*</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0-100，如：10 表示 10%"
                  v-bind="componentField"
                />
              </FormControl>
              <FormDescription>
                填入 0-100 的数值；同一活动所有奖品概率总和不能超过 100%。
                <template v-if="strategy === 'guaranteed'">
                  当前活动为 100% 中奖模式，概率不参与抽奖计算，可填 0。
                </template>
              </FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>

          <div class="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              :disabled="isSubmitting"
              @click="handleDialogOpenChange(false)"
            >
              取消
            </Button>
            <Button type="submit" :disabled="isSubmitting">
              {{ isSubmitting ? '保存中...' : isEditing ? '保存修改' : '创建奖品' }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRoute } from 'vue-router'
import { setActivityName } from '@/composables/useBreadcrumb'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { toast } from 'vue-sonner'
import { Gift, Package, Layers, Trophy, Plus, Info, SquarePen, Trash } from 'lucide-vue-next'

import PageTitle from '@/components/ui/text/pageTitle.vue'
import NumberCard from '@/components/admin/dashboard/numberCard.vue'
import DataTable from '@/components/common/DataTable.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import type { Activity, Prize } from '@/types/api'
import type { TableColumn } from '@/components/common/types'

const route = useRoute()
const activityId = Number(route.params.id)

// ==================== 状态 ====================
const activity = ref<Activity | null>(null)
const prizes = ref<Prize[]>([])
const loading = ref(false)
const dialogOpen = ref(false)
const editingPrize = ref<Prize | null>(null)
const isSubmitting = ref(false)

// ==================== 计算属性 ====================
const isEditing = computed(() => !!editingPrize.value)
const activityName = computed(() => activity.value?.name || '')

const strategy = computed(() => activity.value?.settings?.lottery_strategy || 'probability')

const strategyHint = computed(() => {
  if (strategy.value === 'guaranteed') {
    return '当前活动为「100% 中奖模式」：每次抽奖按奖品剩余库存加权随机，必中一个奖品，各奖品概率设置不参与计算。'
  }
  return '当前活动为「概率模式」：每次抽奖按各奖品设置的概率参与，概率总和需 ≤ 100%，随机未命中则显示未中奖。'
})

const strategyClass = computed(() => {
  if (strategy.value === 'guaranteed') {
    return 'bg-green-50 border-green-200 text-green-800'
  }
  return 'bg-blue-50 border-blue-200 text-blue-800'
})

const prizeTypeCount = computed(() => prizes.value.length)

const totalPrizes = computed(() =>
  prizes.value.reduce((sum, p) => sum + (p.total_quantity || 0), 0),
)

const remainingPrizes = computed(() =>
  prizes.value.reduce((sum, p) => sum + (p.remaining_quantity ?? 0), 0),
)

const awardedPrizes = computed(() => totalPrizes.value - remainingPrizes.value)

const probabilityTotal = computed(() =>
  prizes.value.reduce((sum, p) => sum + Number(Number(String(p.probability || 0)).toFixed(4)), 0),
)

// 统一按钮 class（沿用活动列表操作按钮样式）
const actionBtnCls =
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8'
const actionBtnDangerCls =
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground text-destructive h-8 w-8'

// ==================== 表格列 ====================
const columns = computed<TableColumn[]>(() => [
  {
    key: 'name',
    title: '奖品名称',
    width: '180px',
    render: (value: unknown) => {
      const name = value as string
      return `<span class="font-medium">${name}</span>`
    },
  },
  {
    key: 'description',
    title: '描述',
    minWidth: '160px',
    render: (value: unknown) => {
      const desc = (value as string) || ''
      if (!desc) return '<span class="text-muted-foreground">-</span>'
      return `<span class="text-muted-foreground line-clamp-1 block max-w-[240px] truncate" title="${desc.replace(/"/g, '&quot;')}">${desc}</span>`
    },
  },
  {
    key: 'total_quantity',
    title: '总数量',
    width: '80px',
    align: 'center',
  },
  {
    key: 'remaining_quantity',
    title: '剩余 / 已中出',
    width: '150px',
    render: (_value: unknown, record: Record<string, unknown>) => {
      const prize = record as unknown as Prize
      const total = prize.total_quantity || 0
      const remaining = prize.remaining_quantity ?? 0
      const awarded = Math.max(0, total - remaining)
      const pct = total > 0 ? Math.round((remaining / total) * 100) : 0
      const color = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500'
      return `<div class="flex items-center gap-2 min-w-[140px]">
        <span class="text-sm tabular-nums">${remaining} / ${awarded}</span>
        <div class="h-1.5 w-14 rounded-full bg-gray-200 overflow-hidden shrink-0">
          <div class="h-full rounded-full ${color}" style="width:${pct}%"></div>
        </div>
      </div>`
    },
  },
  {
    key: 'probability',
    title: strategy.value === 'guaranteed' ? '抽奖权重' : '中奖概率',
    width: '110px',
    align: 'center',
    render: (_value: unknown, record: Record<string, unknown>) => {
      const prize = record as unknown as Prize
      if (strategy.value === 'guaranteed') {
        return '<span class="text-muted-foreground">按库存加权</span>'
      }
      const p = Number(String(prize.probability || 0))
      return `<span class="font-medium tabular-nums ${p > 0 ? '' : 'text-muted-foreground'}">${(p * 100).toFixed(2)}%</span>`
    },
  },
  {
    key: 'sort_order',
    title: '排序',
    width: '70px',
    align: 'center',
    render: (value: unknown) => {
      const v = value as number | null | undefined
      return `<span class="text-muted-foreground">${v ?? 0}</span>`
    },
  },
  {
    key: 'created_at',
    title: '创建时间',
    width: '160px',
    render: (value: unknown) => {
      if (!value) return '-'
      return new Date(value as string).toLocaleString('zh-CN')
    },
  },
  {
    key: 'actions',
    title: '操作',
    width: '90px',
    align: 'center',
    render: (_value: unknown, record: Record<string, unknown>) => {
      const prize = record as unknown as Prize
      return h('div', { class: 'flex items-center justify-center gap-2' }, [
        h(
          'button',
          {
            class: actionBtnCls,
            title: '编辑奖品',
            onClick: () => openEditDialog(prize),
          },
          [h(SquarePen, { size: 16 })],
        ),
        h(
          'button',
          {
            class: actionBtnDangerCls,
            title: '删除奖品',
            onClick: () => handleDelete(prize),
          },
          [h(Trash, { size: 16, color: 'red' })],
        ),
      ])
    },
  },
])

// ==================== 表单 ====================
const formSchema = toTypedSchema(
  z.object({
    name: z.string().min(1, '请输入奖品名称').max(100, '奖品名称不能超过100个字符'),
    description: z.string().max(500, '奖品描述不能超过500个字符').optional(),
    total_quantity: z.coerce.number().min(0, '奖品数量不能小于0').int('奖品数量必须是整数'),
    probability: z.coerce.number().min(0, '概率不能小于0').max(100, '概率不能超过100%'),
    sort_order: z.coerce.number().min(0, '排序值不能小于0').int('排序值必须是整数').optional(),
  }),
)

const form = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: '',
    description: '',
    total_quantity: 1,
    probability: 0,
    sort_order: 0,
  },
})

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

const fetchPrizes = async () => {
  loading.value = true
  try {
    const response = await API.adminPrize.getPrizes(activityId)
    prizes.value = response.prizes
  } catch {
    prizes.value = []
  } finally {
    loading.value = false
  }
}

// ==================== 交互 ====================
const handleDialogOpenChange = (open: boolean) => {
  dialogOpen.value = open
  if (!open) {
    editingPrize.value = null
    form.resetForm()
  }
}

const openCreateDialog = () => {
  editingPrize.value = null
  form.resetForm({
    values: {
      name: '',
      description: '',
      total_quantity: 1,
      probability: 0,
      sort_order: 0,
    },
  })
  dialogOpen.value = true
}

const openEditDialog = (prize: Prize) => {
  editingPrize.value = prize
  form.resetForm({
    values: {
      name: prize.name,
      description: prize.description || '',
      total_quantity: prize.total_quantity,
      probability: Number(Number(String(prize.probability || 0)).toFixed(4)) * 100,
      sort_order: prize.sort_order ?? 0,
    },
  })
  dialogOpen.value = true
}

const onSubmit = form.handleSubmit(async (values) => {
  isSubmitting.value = true
  try {
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      total_quantity: values.total_quantity,
      probability: Number((values.probability / 100).toFixed(4)),
      sort_order: values.sort_order ?? 0,
    }

    if (isEditing.value && editingPrize.value) {
      await API.adminPrize.updatePrize(editingPrize.value.id, payload)
      toast.success('奖品更新成功')
    } else {
      await API.adminPrize.createPrize(activityId, payload)
      toast.success('奖品添加成功')
    }

    dialogOpen.value = false
    editingPrize.value = null
    form.resetForm()
    await fetchPrizes()
    await fetchActivity()
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败，请稍后重试'
    toast.error(message)
  } finally {
    isSubmitting.value = false
  }
})

const handleDelete = async (prize: Prize) => {
  if (!confirm(`确定要删除奖品「${prize.name}」吗？删除后不可恢复。`)) {
    return
  }
  try {
    await API.adminPrize.deletePrize(prize.id)
    toast.success('奖品删除成功')
    await fetchPrizes()
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败，请稍后重试'
    toast.error(message)
  }
}

// ==================== 初始化 ====================
onMounted(() => {
  fetchActivity()
  fetchPrizes()
})
</script>
