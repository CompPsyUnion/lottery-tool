<template>
  <div class="min-h-screen bg-white flex items-center justify-center p-4">
    <!-- 加载 / 抽奖执行中 -->
    <div v-if="!done && !error" class="text-gray-800 text-center">
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

    <Toaster />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'
import { lotteryApi, authApi } from '@/api'
import { useUserStore } from '@/stores/user'
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

onMounted(async () => {
  if (!activityId || !edrawCode) {
    error.value = '链接无效（缺少活动或抽奖码参数）'
    return
  }
  await loadActivitySettings()
  execute()
})
</script>
