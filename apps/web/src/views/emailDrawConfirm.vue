<template>
  <div class="min-h-screen bg-white flex items-center justify-center p-4">
    <!-- 品牌位（与管理端同款，左上角） -->
    <BrandBadge />

    <!-- 已撤销：码已恢复可用，可重新点击邮件链接参与 -->
    <div v-if="undone" class="w-full max-w-md">
      <div class="rounded-xl border border-amber-100 bg-amber-50 p-6 text-center space-y-3">
        <div class="text-4xl">↺</div>
        <p class="text-lg font-semibold text-amber-800">已撤销本次抽奖</p>
        <p class="text-sm text-amber-700">
          抽奖码已恢复可用，可重新点击邮件中的「点击抽奖」链接再次参与
        </p>
      </div>
    </div>

    <!-- 加载 / 抽奖执行中 -->
    <div v-else-if="!done && !error" class="text-gray-800 text-center">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mx-auto mb-4"
      ></div>
      <p>正在完成抽奖...</p>
    </div>

    <!-- 错误（链接无效/已用/活动关闭等） -->
    <div v-else-if="error" class="text-gray-800 text-center bg-red-100 p-6 rounded-lg max-w-md">
      <p class="text-lg font-semibold mb-2">无法完成抽奖</p>
      <p class="mb-4 text-sm">{{ error }}</p>
      <button
        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        @click="execute"
      >
        重试
      </button>
    </div>

    <!-- 「点击链接显示结果」关闭：仅确认，结果回大屏看 -->
    <div v-else-if="done && !showResultOnClick" class="w-full max-w-md">
      <div class="rounded-xl border border-green-100 bg-green-50 p-6 text-center space-y-3">
        <div class="text-4xl">✅</div>
        <p class="text-lg font-semibold text-green-800">已完成抽奖确认</p>
        <p class="text-sm text-green-700">抽奖结果请在您提交邮箱的页面（大屏）上查看</p>
      </div>
    </div>

    <!-- 抽奖结果（「点击链接直接显示结果」开启时展示；不含撤销——撤销在原提交页经邮箱可查） -->
    <div v-else class="w-full max-w-md">
      <div class="bg-white rounded-2xl p-8 text-center space-y-6">
        <div class="space-y-4">
          <template v-if="result?.is_winner">
            <div class="text-6xl animate-bounce">🎉</div>
            <h2
              class="text-2xl font-bold bg-linear-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent"
            >
              恭喜中奖！
            </h2>
          </template>
          <template v-else>
            <div class="text-6xl">🤣👉🤡</div>
            <h2 class="text-2xl font-bold text-slate-700">很遗憾</h2>
          </template>
        </div>

        <div v-if="result?.is_winner" class="space-y-4">
          <div
            class="bg-linear-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100"
          >
            <p class="text-sm text-green-700 font-medium mb-2">您获得的奖品</p>
            <p class="text-2xl font-bold text-green-800 mb-3">{{ result.prize?.name }}</p>
            <p v-if="result.prize?.description" class="text-green-600 text-sm leading-relaxed">
              {{ result.prize.description }}
            </p>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div class="bg-slate-50 rounded-xl p-6 border border-slate-200">
            <p class="text-lg text-slate-700 mb-2">本次未中奖</p>
            <p class="text-sm text-slate-500">感谢您的参与，请继续努力！</p>
          </div>
        </div>

        <button
          class="w-full px-8 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition-all shadow-lg"
          @click="done = false"
        >
          返回活动
        </button>
      </div>
    </div>

    <!-- 撤销入口（隐蔽式，与抽奖页同款）：屏幕左下角，hover 显形；
         凭证 = 记录 id + 邮件链接里的抽奖码（码只发给本人邮箱）。
         Teleport 到 body + pointer-events-auto：模态外元素不受 body 点击锁定影响 -->
    <Teleport to="body">
      <button
        v-if="done && !error && recordId"
        class="pointer-events-auto fixed bottom-3 left-4 z-60 text-[11px] text-gray-400/40 hover:text-red-500 opacity-30 hover:opacity-100 transition-all duration-200 select-none"
        title="撤销本次抽奖（恢复库存/抽奖码，删除本次记录）"
        @click="handleUndo"
      >
        ↺ 撤销本次抽奖
      </button>
    </Teleport>

    <Toaster />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'
import { lotteryApi, authApi } from '@/api'
import { useUserStore } from '@/stores/user'
import BrandBadge from '@/components/common/BrandBadge.vue'
import type { Prize } from '@/types/api'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const activityId = Number(route.params.activityId)
const edrawCode = route.query.code as string

// 抽奖执行态
const result = ref<{
  is_winner: boolean
  prize?: Prize | null
} | null>(null)
const done = ref(false)
const error = ref('')
/** 本次抽奖记录 id（撤销凭证之一；测试码无记录则不显示撤销入口） */
const recordId = ref<number | null>(null)
/** 已撤销：置回待参与状态（码已恢复可用，可重新点击邮件链接） */
const undone = ref(false)

// 活动的「点击链接直接显示结果」设置（默认 false=仅确认，结果回大屏看）
const showResultOnClick = ref(true)
const activityLoaded = ref(false)

// 先加载活动设置再执行抽奖
const loadActivitySettings = async () => {
  try {
    const res = await lotteryApi.getActivity(activityId)
    const emailDraw = (
      res.activity.settings as { email_draw?: { show_result_on_click?: boolean } } | undefined
    )?.email_draw
    showResultOnClick.value = emailDraw?.show_result_on_click === true
  } catch {
    // 加载失败按默认（仅确认）处理
    showResultOnClick.value = false
  } finally {
    activityLoaded.value = true
  }
}

// 邮箱即抽码走公开 draw（码即凭证，无需管理员登录，不受活动模式限制）
const execute = async () => {
  error.value = ''
  try {
    // 校验 token（若活动有额外的参与者信息要求，draw 端点会返回明确错误）
    if (userStore.token) {
      try {
        await authApi.me()
      } catch {
        userStore.clearToken()
      }
    }

    const res = await lotteryApi.confirmEmailDraw(activityId, edrawCode)
    result.value = { is_winner: res.is_winner, prize: res.prize || null }
    recordId.value = res.lottery_record?.id ?? null
    done.value = true

    // 「点击链接直接显示结果」关闭时：不在本设备展示结果（含 toast），只确认
    if (!showResultOnClick.value) return

    if (res.is_winner && res.prize) {
      toast.success(`🎉 恭喜您抽中了：${res.prize.name}！`)
    } else {
      toast.info('很遗憾，本次未中奖')
    }
  } catch (err) {
    let msg = '抽奖失败，请稍后重试'
    if (err && typeof err === 'object' && 'message' in err) {
      msg = (err as { message: string }).message
    }
    error.value = msg
  }
}

// 撤销本次抽奖（记录 id + 邮件码为凭证，与抽奖同信任级；已签字记录后端拒绝）
const undoing = ref(false)
const handleUndo = async () => {
  if (!recordId.value || undoing.value) return
  const summary = result.value?.is_winner
    ? `撤销后本次中奖记录将删除，奖品「${result.value.prize?.name ?? '-'}」库存恢复，抽奖码置回未使用。`
    : '撤销后本次抽奖记录将删除，抽奖码置回未使用。'
  if (!confirm(`确定撤销本次抽奖吗？\n\n${summary}`)) return

  undoing.value = true
  try {
    await lotteryApi.undoDraw(activityId, {
      record_id: recordId.value,
      lottery_code: edrawCode,
    })
    toast.success('已撤销：库存/抽奖码已恢复，可重新点击邮件链接参与')
    done.value = false
    result.value = null
    recordId.value = null
    undone.value = true
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '撤销失败，请重试')
  } finally {
    undoing.value = false
  }
}

onMounted(async () => {
  if (!activityId || !edrawCode) {
    error.value = '链接无效（缺少活动或抽奖码参数）'
    return
  }
  await loadActivitySettings()
  execute()
})
</script>
