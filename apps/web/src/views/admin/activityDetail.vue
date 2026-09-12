<template>
  <div class="space-y-6">
    <PageTitle
      :title="activity?.name || 'Activity Detail'"
      :sub-title="activity?.description || ''"
    />

    <!-- 状态卡：状态流转主阵地（draft→ready→active→ended，ready 可撤回） -->
    <div class="rounded-lg border p-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">活动状态</span>
            <span
              class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
              :class="statusBadgeClass"
            >
              {{ statusLabel }}
            </span>
          </div>
          <div class="text-xs text-muted-foreground">
            开始：{{ formatTime(activity?.start_time) }} · 结束：{{
              formatTime(activity?.end_time)
            }}
            <template v-if="activity?.status === 'ready' && !activity?.start_time">
              · 未设置开始时间，到期扫描（每分钟）后将立即开始
            </template>
          </div>
        </div>

        <!-- 按流转矩阵渲染操作 -->
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="activity?.status === 'draft'">
            <Button :disabled="transitioning" @click="handleTransition('ready')">
              发布（就绪）
            </Button>
          </template>
          <template v-else-if="activity?.status === 'ready'">
            <Button :disabled="transitioning" @click="handleTransition('active')">
              立即开始
            </Button>
            <Button variant="outline" :disabled="transitioning" @click="handleTransition('draft')">
              撤回发布
            </Button>
          </template>
          <template v-else-if="activity?.status === 'active'">
            <Button
              variant="destructive"
              :disabled="transitioning"
              @click="handleTransition('ended')"
            >
              结束活动
            </Button>
          </template>
          <span v-else class="text-xs text-muted-foreground self-center"> 活动已结束（终态） </span>

          <!-- 抽奖入口（独立于流转：任意状态可用） -->
          <div class="flex gap-2 border-l pl-4 ml-2">
            <Button variant="outline" @click="showDemoDialog = true">
              <Play class="mr-1 h-4 w-4" />
              抽奖页面测试
            </Button>
            <Button variant="outline" @click="openLotteryPage">
              <ExternalLink class="mr-1 h-4 w-4" />
              打开抽奖页
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Webhook 接入卡（第三方表单 / 系统对接） -->
    <div v-if="webhookInfo" class="rounded-lg border p-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0 flex-1 space-y-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">Webhook 接入</span>
            <span class="text-xs text-muted-foreground">第三方表单 / 系统对接</span>
          </div>

          <!-- Token（默认掩码） -->
          <div class="space-y-1.5">
            <div class="text-xs text-muted-foreground">访问 Token</div>
            <div class="flex flex-wrap items-center gap-2">
              <code
                class="min-w-0 flex-1 basis-40 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all"
              >
                {{ showToken ? webhookInfo.webhook_token : '••••••••••••••••••••••••' }}
              </code>
              <Button variant="outline" size="sm" class="shrink-0" @click="showToken = !showToken">
                {{ showToken ? '隐藏' : '显示' }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="shrink-0"
                @click="copyText(webhookInfo.webhook_token, 'Token 已复制')"
              >
                复制
              </Button>
            </div>
          </div>

          <!-- 批量接码端点 -->
          <div class="space-y-1.5">
            <div class="text-xs text-muted-foreground">
              批量添加抽奖码端点（请求头 Authorization: Bearer &lt;Token&gt;）
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <code
                class="min-w-0 flex-1 basis-40 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all"
              >
                POST {{ webhookInfo.webhook_url }}
              </code>
              <Button
                variant="outline"
                size="sm"
                class="shrink-0"
                @click="copyText(webhookInfo.webhook_url, '端点地址已复制')"
              >
                复制
              </Button>
            </div>
          </div>

          <!-- 金山表单端点（token 已内嵌，可直接粘贴） -->
          <div class="space-y-1.5">
            <div class="text-xs text-muted-foreground">
              金山表单端点（token 已含在地址中，直接粘贴到表单 Webhook 配置即可）
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <code
                class="min-w-0 flex-1 basis-40 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all"
              >
                {{ showToken ? webhookInfo.kdocs_url : maskedKdocsUrl }}
              </code>
              <Button
                variant="outline"
                size="sm"
                class="shrink-0"
                @click="copyText(webhookInfo.kdocs_url, '金山表单端点已复制')"
              >
                复制
              </Button>
            </div>
          </div>
        </div>

        <Button
          variant="destructive"
          class="shrink-0"
          :disabled="regenerating"
          @click="handleRegenerateToken"
        >
          {{ regenerating ? '生成中...' : '重新生成 Token' }}
        </Button>
      </div>
    </div>

    <!-- 概览数值卡片 -->
    <div class="grid md:grid-cols-3 grid-cols-1 gap-4">
      <NumberCard title="奖品种数" :value="prizeTypeCount" :icon="Gift" />
      <NumberCard title="抽奖码数" :value="totalLotteryCodes" :icon="Ticket" />
      <NumberCard
        title="剩余奖品数 / 奖品总数"
        :value="`${remainingPrizes} / ${totalPrizes}`"
        :icon="Package"
      />
    </div>

    <!-- 抽奖记录表格 -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="scroll-m-20 text-xl font-semibold tracking-tight">抽奖记录</h3>
      </div>

      <!-- 搜索和筛选区域 -->
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1">
          <div class="relative">
            <Search
              class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4"
            />
            <Input
              v-model="searchQuery"
              placeholder="搜索抽奖码、姓名..."
              class="pl-10 w-full"
              @input="handleSearch"
            />
          </div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" @click="router.push(`/admin/activities/prizes/${activityId}`)">
            管理奖品
          </Button>
        </div>
      </div>

      <!-- 数据表格 -->
      <DataTable
        :data="lotteryRecords"
        :columns="columns"
        :loading="loading"
        :pagination="{
          current: currentPage,
          pageSize: pageSize,
          total: totalRecords,
        }"
        :empty-text="'暂无抽奖记录'"
        @page-change="handlePageChange"
      />
    </div>

    <!-- 抽奖页面测试 Dialog（共用组件） -->
    <DemoDrawDialog v-model:open="showDemoDialog" :activity-id="activityId" />

    <!-- 补签 Dialog（管理面板操作，可取消） -->
    <SignatureDialog
      v-model:visible="showResignDialog"
      :is-submitting="isSubmittingResign"
      :error-message="resignError"
      @confirm="handleResignConfirm"
      @cancel="showResignDialog = false"
    />

    <!-- 签字预览 Dialog -->
    <Dialog :open="showSignaturePreview" @update:open="showSignaturePreview = $event">
      <DialogContent class="max-w-2xl mx-4">
        <DialogHeader>
          <DialogTitle>签字预览</DialogTitle>
        </DialogHeader>
        <div class="space-y-4">
          <div v-if="previewRecordInfo" class="text-sm text-gray-600 space-y-1">
            <p><span class="font-medium">抽奖码：</span>{{ previewRecordInfo.code }}</p>
            <p><span class="font-medium">参与者：</span>{{ previewRecordInfo.name }}</p>
            <p><span class="font-medium">签字时间：</span>{{ previewRecordInfo.signedAt }}</p>
          </div>
          <div class="border rounded-lg p-4 bg-gray-50 flex justify-center">
            <img
              :src="previewSignatureUrl"
              alt="签字图片"
              class="max-w-full max-h-80 object-contain"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { setActivityName } from '@/composables/useBreadcrumb'
import { useDebounceFn } from '@vueuse/core'
import PageTitle from '@/components/ui/text/pageTitle.vue'
import NumberCard from '@/components/admin/dashboard/numberCard.vue'
import DataTable from '@/components/common/DataTable.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Package, Gift, Search, Ticket, Eye, Play, ExternalLink, PenLine } from 'lucide-vue-next'
import DemoDrawDialog from '@/components/admin/demoDrawDialog.vue'
import SignatureDialog from '@/components/common/SignatureDialog.vue'
import { API } from '@/api'
import { toast } from 'vue-sonner'
import type { Activity, Prize, LotteryRecord, ActivityWebhookInfo } from '@/types/api'
import type { TableColumn } from '@/components/common/types'

const route = useRoute()
const router = useRouter()
const activityId = Number(route.params.id)


// 响应式数据
const activity = ref<Activity | null>(null)
const prizes = ref<Prize[]>([])
const lotteryRecords = ref<LotteryRecord[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const totalRecords = ref(0)
const searchQuery = ref('')

// 签字预览
const showSignaturePreview = ref(false)
const previewSignatureUrl = ref('')
const previewRecordInfo = ref<{ code: string; name: string; signedAt: string } | null>(null)

// 计算属性
const prizeTypeCount = computed(() => {
  return prizes.value.length
})

const totalLotteryCodes = computed(() => {
  return activity.value?.lottery_codes_count || 0
})

const totalPrizes = computed(() => {
  return prizes.value.reduce((sum, prize) => sum + prize.total_quantity, 0)
})

const remainingPrizes = computed(() => {
  return prizes.value.reduce((sum, prize) => sum + prize.remaining_quantity, 0)
})

// 表格列定义
const columns: TableColumn[] = [
  {
    key: 'lotteryCode',
    title: '抽奖码',
    width: '120px',
  },
  {
    key: 'name',
    title: '参与者',
    width: '100px',
    render: (value: unknown) => (value as string) || '-',
  },
  {
    key: 'phone',
    title: '手机号',
    width: '120px',
    render: (value: unknown) => (value as string) || '-',
  },
  {
    key: 'is_winner',
    title: '中奖状态',
    width: '100px',
    align: 'center',
    render: (value: unknown) => {
      const isWinner = value as boolean
      return h(
        'span',
        {
          class: `inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            isWinner ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`,
        },
        isWinner ? '中奖' : '未中奖',
      )
    },
  },
  {
    key: 'prize',
    title: '奖品',
    width: '150px',
    render: (value: unknown) => (value as string) || '-',
  },
  {
    key: 'operator',
    title: '操作员',
    width: '100px',
    render: (value: unknown) => (value as string) || '-',
  },
  {
    key: 'created_at',
    title: '抽奖时间',
    width: '160px',
    render: (value: unknown) => {
      return new Date(value as string).toLocaleString('zh-CN')
    },
  },
  {
    key: 'signature_status',
    title: '签字',
    width: '100px',
    align: 'center',
    render: (_value: unknown, row: unknown) => {
      const record = row as LotteryRecord
      const isSigned = record.signature_status === 'signed'
      if (isSigned) {
        return h(
          'button',
          {
            class:
              'inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium',
            onClick: () => openSignaturePreview(record),
          },
          [h(Eye, { class: 'w-4 h-4' }), '已签'],
        )
      }
      // 未签：线下活动的记录提供补签入口（真实/测试记录均可）
      if (activity.value?.lottery_mode === 'offline') {
        return h(
          'button',
          {
            class:
              'inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium',
            onClick: () => openResign(record),
          },
          [h(PenLine, { class: 'w-4 h-4' }), '补签'],
        )
      }
      return h(
        'span',
        {
          class:
            'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500',
        },
        '未签',
      )
    },
  },
]

// 获取活动详情
const fetchActivity = async () => {
  try {
    const response = await API.adminActivity.getActivity(activityId)
    activity.value = response.activity
    setActivityName(response.activity?.name || '')
  } catch {
    // 获取活动详情失败
    activity.value = null
  }
}

// ---- 状态流转 ----
const transitioning = ref(false)

const STATUS_META: Record<string, { label: string; class: string }> = {
  draft: { label: 'Draft', class: 'bg-muted text-foreground' },
  ready: { label: 'Ready', class: 'bg-blue-100 text-blue-700' },
  active: { label: 'Ongoing', class: 'bg-green-100 text-green-700' },
  ended: { label: 'Ended', class: 'bg-red-100 text-red-700' },
}

const statusLabel = computed(() => STATUS_META[activity.value?.status ?? 'draft']?.label ?? '-')
const statusBadgeClass = computed(
  () => STATUS_META[activity.value?.status ?? 'draft']?.class ?? 'bg-muted text-foreground',
)

const formatTime = (t?: string | null) =>
  t ? new Date(t).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) : '不限'

const handleTransition = async (target: 'draft' | 'ready' | 'active' | 'ended') => {
  const actionText =
    target === 'ended'
      ? '确定要结束该活动吗？结束后不可恢复。'
      : target === 'draft'
        ? '确定要撤回发布吗？活动将回到草稿状态。'
        : null
  if (actionText && !confirm(actionText)) return

  transitioning.value = true
  try {
    await API.adminActivity.updateActivityStatus(activityId, target)
    toast.success('状态已更新')
    await fetchActivity()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '状态更新失败')
  } finally {
    transitioning.value = false
  }
}

// ---- 抽奖入口 ----
const showDemoDialog = ref(false)
const openLotteryPage = () => {
  window.open(`${location.origin}/lottery?activityId=${activityId}`, '_blank')
}

// ---- Webhook 接入 ----
const webhookInfo = ref<ActivityWebhookInfo | null>(null)
const showToken = ref(false)
const regenerating = ref(false)

/** 掩码展示形态（kdocs_url 内嵌 token；复制始终复制真实地址） */
const maskedKdocsUrl = computed(() =>
  (webhookInfo.value?.kdocs_url ?? '').replace(/token=[^&]+/, 'token=***'),
)

const fetchWebhookInfo = async () => {
  try {
    webhookInfo.value = await API.adminActivity.getWebhookInfo(activityId)
  } catch {
    // 获取失败隐藏卡片（不影响页面主内容）
    webhookInfo.value = null
  }
}

const handleRegenerateToken = async () => {
  if (
    !confirm('确定要重新生成 Webhook Token 吗？旧 Token（含金山表单中已配置的地址）将立即失效。')
  ) {
    return
  }
  regenerating.value = true
  try {
    // 响应与 webhook-info 同形，直接替换
    webhookInfo.value = await API.adminActivity.regenerateWebhookToken(activityId)
    showToken.value = true
    toast.success('Token 已重新生成，请更新表单侧配置')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '重新生成失败')
  } finally {
    regenerating.value = false
  }
}

// 复制到剪贴板（安全上下文用 clipboard API，否则回退 execCommand）
const copyText = async (text: string, successMessage: string) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    toast.success(successMessage)
  } catch {
    toast.error('复制失败，请手动复制')
  }
}

// 获取奖品列表
const fetchPrizes = async () => {
  try {
    const response = await API.adminPrize.getPrizes(activityId)
    prizes.value = response.prizes
  } catch {
    // 获取奖品列表失败
    prizes.value = []
  }
}

// 获取抽奖记录
const fetchLotteryRecords = async () => {
  loading.value = true
  try {
    const response = await API.adminActivity.getLotteryRecords(activityId, {
      page: currentPage.value,
      limit: pageSize.value,
      keyword: searchQuery.value || undefined,
    })
    lotteryRecords.value = response.records
    totalRecords.value = response.pagination.total
  } catch {
    // 获取抽奖记录失败
    lotteryRecords.value = []
    totalRecords.value = 0
  } finally {
    loading.value = false
  }
}

// 处理页码变化
const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchLotteryRecords()
}

// 防抖搜索
const handleSearch = useDebounceFn(() => {
  currentPage.value = 1
  fetchLotteryRecords()
}, 500)

// 打开签字预览（按需拉取 data URL，列表数据不含签字大字段）
const openSignaturePreview = async (record: LotteryRecord) => {
  try {
    const res = await API.adminActivity.fetchSignature(activityId, record.id)
    if (!res.signature_data) return
    previewSignatureUrl.value = res.signature_data
    previewRecordInfo.value = {
      code: record.lotteryCode || '-',
      name: record.name || '-',
      signedAt: res.signed_at ? new Date(res.signed_at).toLocaleString('zh-CN') : '-',
    }
    showSignaturePreview.value = true
  } catch (err) {
    console.error('获取签字图片失败:', err)
  }
}

// ---- 补签（未签字的线下记录） ----
const showResignDialog = ref(false)
const isSubmittingResign = ref(false)
const resignError = ref('')
const resignRecordId = ref<number | null>(null)

const openResign = (record: LotteryRecord) => {
  resignRecordId.value = record.id
  resignError.value = ''
  showResignDialog.value = true
}

const handleResignConfirm = async (dataUrl: string) => {
  if (!resignRecordId.value) return
  isSubmittingResign.value = true
  resignError.value = ''
  try {
    await API.adminActivity.uploadSignature(activityId, resignRecordId.value, {
      image: dataUrl,
    })
    toast.success('补签成功')
    showResignDialog.value = false
    resignRecordId.value = null
    await fetchLotteryRecords()
  } catch (err) {
    resignError.value = err instanceof Error ? err.message : '补签失败，请重试'
    toast.error(resignError.value)
  } finally {
    isSubmittingResign.value = false
  }
}

// 初始化数据
const initData = async () => {
  await Promise.all([fetchActivity(), fetchPrizes(), fetchLotteryRecords(), fetchWebhookInfo()])
}

// 组件挂载时获取数据
onMounted(() => {
  initData()
})
</script>
