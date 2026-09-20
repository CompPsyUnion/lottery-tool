<template>
  <div class="min-h-screen bg-white flex items-center justify-center p-4">
    <!-- 加载状态 -->
    <div v-if="loading" class="text-gray-800 text-center">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mx-auto mb-4"
      ></div>
      <p>加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="text-gray-800 text-center bg-red-100 p-6 rounded-lg">
      <p class="text-lg font-semibold mb-2">加载失败</p>
      <p class="mb-4">{{ error }}</p>
      <button
        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        @click="loadActivityInfo"
      >
        重试
      </button>
    </div>

    <!-- 主要内容 -->
    <div
      v-else
      class="w-full max-w-4xl flex flex-col lg:flex-row gap-8 items-center justify-center"
    >
      <!-- 盒子一：抽奖框 -->
      <div class="lottery-box-one bg-white rounded-2xl p-8 w-full max-w-md">
        <!-- 活动标题 -->
        <div class="text-center mb-8">
          <img
            v-if="activityInfo?.icon"
            :src="activityInfo.icon"
            alt="活动图标"
            class="h-16 w-16 mx-auto mb-4 rounded-full object-cover"
          />
          <h1 class="text-2xl font-bold text-gray-800 mb-2">
            {{ activityInfo?.name || '抽奖活动' }}
          </h1>
          <p v-if="activityInfo?.description" class="text-gray-600 text-sm">
            {{ activityInfo.description }}
          </p>
        </div>

        <!-- 邮箱链接确认完成（活动关闭了点击设备展示结果）：仅确认，回原页面查看 -->
        <div v-if="edrawConfirmedNotice" class="mb-6">
          <div class="rounded-xl border border-green-100 bg-green-50 p-6 text-center space-y-3">
            <div class="text-4xl">✅</div>
            <p class="text-lg font-semibold text-green-800">已完成抽奖确认</p>
            <p class="text-sm text-green-700">抽奖结果请在您提交邮箱的页面（大屏）上查看</p>
          </div>
        </div>

        <!-- 邮箱即抽：等待确认（已发邮件，长轮询结果中） -->
        <div v-if="emailDrawWaiting" class="mb-6 space-y-4">
          <div class="rounded-xl border border-blue-100 bg-blue-50 p-5 text-center space-y-3">
            <div class="text-3xl">😈</div>
            <p class="text-sm text-slate-700">
              确认邮件已发送至<br />
              <span class="font-mono font-medium">{{ emailDrawEmail }}</span>
            </p>
            <p class="text-xs text-slate-500">
              请在邮箱中点击「点击抽奖」链接完成抽奖，结果将在此处自动显示
            </p>
            <div v-if="emailPolling" class="text-xs text-slate-400">
              <span
                class="inline-block animate-spin rounded-full h-3 w-3 border-b border-slate-400 align-[-1px]"
              ></span>
              正在等待邮件确认...
            </div>
          </div>
          <button class="draw-button" @click="cancelEmailWait">取消等待</button>
        </div>

        <!-- 邮箱即抽：前缀输入（替代抽奖码输入；确认完成后隐藏） -->
        <div v-else-if="emailDrawEnabled && !edrawConfirmedNotice" class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
          <div class="flex items-center">
            <Input
              v-model="emailPrefix"
              placeholder="输入邮箱前缀"
              class="flex-1 text-lg font-mono"
              @keyup.enter="handleRequestEmailDraw"
            />
            <span class="ml-1 shrink-0 text-lg text-gray-500 font-mono">{{ emailDrawSuffix }}</span>
          </div>
          <p class="mt-2 text-xs text-gray-400">
            无需抽奖码：提交后系统向 {{ emailDrawSuffix }} 邮箱发送确认邮件，点击链接即抽
          </p>
        </div>

        <!-- 抽奖码输入框（未开启邮箱即抽的常规入口；确认完成后隐藏） -->
        <div v-else-if="!edrawConfirmedNotice" class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">抽奖码</label>
          <Input
            v-model="lotteryCode"
            placeholder="请输入抽奖码"
            class="w-full text-center text-lg md:text-2xl lg:text-3xl font-mono tracking-wider lottery-code-input"
            :maxlength="getMaxLength()"
            @input="onInputChange"
          />
        </div>

        <!-- 参与者信息（仅online模式且未开启邮箱即抽） -->
        <div
          v-if="activityInfo?.lottery_mode === 'online' && !emailDrawEnabled"
          class="mb-6 space-y-4"
        >
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">姓名</label>
            <Input v-model="participantInfo.name" placeholder="请输入姓名" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">手机号</label>
            <Input v-model="participantInfo.phone" placeholder="请输入手机号" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">邮箱（可选）</label>
            <Input v-model="participantInfo.email" placeholder="请输入邮箱" type="email" />
          </div>
        </div>

        <!-- 立即抽奖按钮（邮箱即抽：提交前缀发确认邮件） -->
        <button
          v-if="emailDrawEnabled && !edrawConfirmedNotice"
          :disabled="!emailPrefix.trim() || isDrawing"
          class="draw-button"
          @click="handleRequestEmailDraw"
        >
          <Gift class="w-5 h-5" />
          {{ isDrawing ? '发送中...' : '参与抽奖' }}
        </button>
        <button
          v-else-if="!edrawConfirmedNotice"
          :disabled="!canDraw || isDrawing"
          class="draw-button"
          @click="handleDraw()"
        >
          <Gift class="w-5 h-5" />
          {{ isDrawing ? '抽奖中...' : '立即抽奖' }}
        </button>
      </div>

      <!-- 盒子二：数字键盘（仅桌面和平板显示，offline 模式且未开启邮箱即抽） -->
      <div
        v-if="activityInfo?.lottery_mode === 'offline' && !emailDrawEnabled"
        class="keyboard-box bg-white bg-opacity-90 backdrop-blur-sm p-6 hidden md:block"
      >
        <h3 class="text-lg font-semibold text-gray-800 mb-4 text-center">数字键盘</h3>
        <div class="grid grid-cols-3 gap-3 w-64">
          <!-- 数字键 1-9 -->
          <button
            v-for="num in [1, 2, 3, 4, 5, 6, 7, 8, 9]"
            :key="num"
            class="h-12 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold text-gray-800 transition-colors"
            @click="inputNumber(num.toString())"
          >
            {{ num }}
          </button>
          <!-- 空白 -->
          <div></div>
          <!-- 数字键 0 -->
          <button
            class="h-12 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold text-gray-800 transition-colors"
            @click="inputNumber('0')"
          >
            0
          </button>
          <!-- 退格键 -->
          <button
            class="h-12 bg-red-100 hover:bg-red-200 rounded-lg font-semibold text-red-600 transition-colors flex items-center justify-center"
            @click="deleteNumber"
          >
            <Delete class="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>

    <!-- 抽奖结果Dialog（关闭前拦截：提前退出需经「确认撤销」弹窗） -->
    <Dialog :open="showResult" @update:open="handleResultCloseRequest">
      <DialogContent
        class="max-w-lg mx-4 rounded-2xl border-0 shadow-2xl"
        :show-close-button="false"
        @escape-key-down.prevent
        @pointer-down-outside.prevent
      >
        <DialogHeader class="pb-6">
          <DialogTitle class="text-center space-y-4">
            <div v-if="lotteryResult?.is_winner" class="space-y-4">
              <div class="text-6xl animate-bounce">🎉</div>
              <h2
                class="text-2xl font-bold bg-linear-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent"
              >
                恭喜中奖！
              </h2>
            </div>
            <div v-else class="space-y-4">
              <div class="text-6xl">🤣👉🤡</div>
              <h2 class="text-2xl font-bold text-slate-700">很遗憾</h2>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div class="text-center space-y-6 py-4">
          <div v-if="lotteryResult?.is_winner" class="space-y-4">
            <div
              class="bg-linear-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100"
            >
              <p class="text-sm text-green-700 font-medium mb-2">您获得的奖品</p>
              <p class="text-2xl font-bold text-green-800 mb-3">{{ lotteryResult.prize?.name }}</p>
              <p
                v-if="lotteryResult.prize?.description"
                class="text-green-600 text-sm leading-relaxed"
              >
                {{ lotteryResult.prize.description }}
              </p>
            </div>

            <!-- 参与者信息 -->
            <div
              v-if="lotteryResult.lottery_code?.participant_info"
              class="bg-slate-50 rounded-xl p-4 border border-slate-200"
            >
              <p class="text-sm text-slate-600 font-medium mb-2">中奖信息</p>
              <div class="space-y-1 text-sm text-slate-700">
                <p>
                  <span class="font-medium">姓名：</span
                  >{{ lotteryResult.lottery_code.participant_info.name }}
                </p>
                <p>
                  <span class="font-medium">抽奖码：</span>{{ lotteryResult.lottery_code.code }}
                </p>
              </div>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div class="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <p class="text-lg text-slate-700 mb-2">本次未中奖</p>
              <p class="text-sm text-slate-500">感谢您的参与，请继续努力！</p>
            </div>
          </div>

          <p v-if="lotteryResult?.is_demo" class="text-center text-xs text-muted-foreground">
            测试抽奖——未扣减奖品库存，测试记录不计入统计
          </p>
        </div>

        <DialogFooter class="pt-6">
          <div class="w-full flex justify-center gap-3">
            <!-- 撤销本次操作：中奖在签字完成前可撤销（恢复库存/码/删记录）；
                 轮询来源的结果本机无抽奖码，撤销仅在邮件链接打开的设备可用 -->
            <button
              v-if="!resultFromPoll"
              class="px-6 py-3 border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-xl transition-all duration-200"
              @click="showUndoConfirm = true"
            >
              撤销本次操作
            </button>
            <!-- 需要签字：主按钮为「去签字」，手动进入必签流程 -->
            <button
              v-if="pendingSignature"
              class="px-8 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition-all duration-200 shadow-lg transform"
              @click="goSignature"
            >
              去签字确认
            </button>
            <!-- 无签字环节：确定=保留结果离开 -->
            <button
              v-else
              class="px-8 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-xl transition-all duration-200 shadow-lg transform"
              @click="keepResult"
            >
              确定
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 撤销确认弹窗（撤销按钮 / 提前退出结果页共用） -->
    <Dialog :open="showUndoConfirm" @update:open="(open) => (showUndoConfirm = open)">
      <DialogContent class="max-w-md mx-4 rounded-2xl border-0 shadow-2xl">
        <DialogHeader class="pb-4">
          <DialogTitle class="text-center text-xl font-bold text-slate-700">
            确认撤销本次抽奖？
          </DialogTitle>
        </DialogHeader>
        <div class="text-sm text-slate-600 space-y-2 text-center">
          <p>撤销后本次抽奖作废：</p>
          <p>· 中奖奖品库存将复原</p>
          <p>· 抽奖码恢复可用（可重新参与）</p>
          <p>· 本次抽奖记录将被删除</p>
          <p class="text-xs text-muted-foreground">已签字确认的抽奖不可撤销</p>
        </div>
        <DialogFooter class="pt-6">
          <div class="w-full flex justify-center gap-3">
            <button
              class="px-6 py-2.5 border rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-all"
              @click="showUndoConfirm = false"
            >
              再想想
            </button>
            <button
              class="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-all"
              :disabled="undoing"
              @click="handleUndoConfirm"
            >
              {{ undoing ? '撤销中...' : '确认撤销' }}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 签字弹窗（必签：不可取消/ESC/遮罩关闭；签字完成前可经「撤销本次抽奖」退出） -->
    <SignatureDialog
      v-model:visible="showSignature"
      :is-submitting="isSubmittingSignature"
      :error-message="signatureError"
      :dismissible="false"
      :show-undo="true"
      @confirm="handleSignatureConfirm"
      @undo="showUndoConfirm = true"
    />

    <!-- Toast 组件 -->
    <Toaster />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Gift, Delete } from 'lucide-vue-next'
import { toast, Toaster } from 'vue-sonner'
import { lotteryApi, adminActivityApi } from '@/api'
import type { Activity, Prize, LotteryRecord } from '@/types/api'
import SignatureDialog from '@/components/common/SignatureDialog.vue'

const urlParams = new URLSearchParams(window.location.search)
const activityId = Number(urlParams.get('activityId'))

// 响应式数据
const loading = ref(true)
const error = ref<string>('')
const activityInfo = ref<Activity | null>(null)
const prizes = ref<Prize[]>([])
const lotteryCode = ref<string>('')
const isDrawing = ref(false)
const showResult = ref(false)
const lotteryResult = ref<{
  is_winner: boolean
  /** 测试码测试抽奖：不扣库存、不写记录 */
  is_demo?: boolean
  prize?: Prize | null
  lottery_record?: LotteryRecord | null
  lottery_code?: {
    code: string
    participant_info?: { name: string; phone: string; email?: string }
  } | null
} | null>(null)

// URL 携带 code 时预填抽奖码（管理端测试链接）；编程式赋值不触发输入过滤，
// 不会破坏含小写字母的码值
const presetCode = urlParams.get('code')
if (presetCode) lotteryCode.value = presetCode

// 签字相关
const showSignature = ref(false)
const isSubmittingSignature = ref(false)
const signatureError = ref('')
const currentRecordId = ref<number | null>(null)
/** 本次抽奖需要签字（结果弹窗据此展示「去签字」按钮，手动进入） */
const pendingSignature = ref(false)

// 撤销本次抽奖（签字完成前）：中奖恢复库存/码置回/删记录
const showUndoConfirm = ref(false)
const undoing = ref(false)
/** 撤销凭证：本次使用的抽奖码（清空输入前留存） */
const lastDrawnCode = ref('')

// ---- 邮箱即抽 ----
const emailDrawEnabled = computed(() => activityInfo.value?.settings?.email_draw?.enabled === true)
const emailDrawSuffix = computed(
  () => activityInfo.value?.settings?.email_draw?.domain_suffix || '',
)
const emailPrefix = ref('')
const emailDrawWaiting = ref(false)
const emailDrawEmail = ref('')
const emailPolling = ref(false)
let emailPollStopped = true
/** 结果来自提交页长轮询（本机无抽奖码，撤销仅在邮件链接打开的设备上可用） */
const resultFromPoll = ref(false)
/** 旧版邮件链接 ?edraw=code 的兼容入口（新邮件已指向 /edraw/:activityId 子页）；
 *  仍自动以公开 draw 执行（无视 offline 登录门槛） */
const edrawCode = urlParams.get('edraw')
if (edrawCode) lotteryCode.value = edrawCode
/** 「点击链接显示结果」默认关闭：链接设备仅确认参与，结果只在原提交页（大屏）展示 */
const edrawHideResult = computed(
  () => activityInfo.value?.settings?.email_draw?.show_result_on_click !== true,
)
const edrawConfirmedNotice = ref(false)

// 参与者信息（仅online模式需要）
const participantInfo = ref({
  name: '',
  phone: '',
  email: '',
})

// 计算属性
const canDraw = computed(() => {
  if (!lotteryCode.value.trim()) return false

  if (activityInfo.value?.lottery_mode === 'online') {
    return participantInfo.value.name.trim() && participantInfo.value.phone.trim()
  }

  return true
})

// 获取抽奖码最大长度
const getMaxLength = () => {
  const format = activityInfo.value?.settings?.lottery_code_format
  switch (format) {
    case '4_digit_number':
      return 4
    case '8_digit_number':
    case '8_digit_alphanumeric':
      return 8
    case '12_digit_number':
    case '12_digit_alphanumeric':
      return 12
    default:
      return 10
  }
}

// 输入框变化处理
const onInputChange = () => {
  const format = activityInfo.value?.settings?.lottery_code_format
  if (format?.includes('number')) {
    // 只允许数字
    lotteryCode.value = lotteryCode.value.replace(/[^0-9]/g, '')
  } else if (format?.includes('alphanumeric')) {
    // 允许字母和数字
    lotteryCode.value = lotteryCode.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  }
}

// 数字键盘输入
const inputNumber = (num: string) => {
  if (lotteryCode.value.length < getMaxLength()) {
    lotteryCode.value += num
  }
}

// 删除数字
const deleteNumber = () => {
  lotteryCode.value = lotteryCode.value.slice(0, -1)
}

// 加载活动信息
const loadActivityInfo = async () => {
  if (!activityId) {
    error.value = '缺少活动ID参数'
    loading.value = false
    return
  }

  try {
    loading.value = true
    error.value = ''

    const response = await lotteryApi.getActivity(activityId)
    activityInfo.value = response.activity
    prizes.value = response.prizes || []

    // 检查活动状态（URL 带 code 为管理端测试入口：测试码无视活动状态，放行并提示）
    if (activityInfo.value.status !== 'active' && !presetCode) {
      error.value = activityInfo.value.status === 'ended' ? '活动已结束' : '活动未开始'
      return
    }
    if (activityInfo.value.status !== 'active' && presetCode) {
      toast.info('当前活动未在进行中——测试模式：测试抽奖码仍可体验抽奖流程')
    }
  } catch (err) {
    // 加载活动信息失败

    // 解析API返回的错误信息
    let errorMessage = '获取活动信息失败，请稍后重试'
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (
        err as { response?: { data?: { error?: { message?: string; details?: string } } } }
      ).response
      if (response?.data?.error) {
        const apiError = response.data.error
        errorMessage = apiError.message || errorMessage
        if (apiError.details) {
          errorMessage += ` (${apiError.details})`
        }
      }
    } else if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as { message: string }).message
    }

    error.value = errorMessage
    toast.error(errorMessage)
  } finally {
    loading.value = false
  }
}

// 处理抽奖（forceOnline：邮件链接自动抽奖路径，offline 活动亦走公开 draw）
const handleDraw = async (opts?: { forceOnline?: boolean }) => {
  const forceOnline = opts?.forceOnline === true
  if ((!canDraw.value && !forceOnline) || isDrawing.value) return

  // 输入验证
  if (!lotteryCode.value.trim()) {
    toast.error('请输入抽奖码')
    return
  }

  if (activityInfo.value?.lottery_mode === 'online') {
    if (!participantInfo.value.name.trim()) {
      toast.error('请输入姓名')
      return
    }
    if (!participantInfo.value.phone.trim()) {
      toast.error('请输入手机号')
      return
    }
  }

  // 抽奖是公开动作：抽奖码即凭证（线上/线下/邮件链接同一公开端点，均无需登录）
  try {
    isDrawing.value = true

    const drawResponse = await lotteryApi.draw(activityId, {
      lottery_code: lotteryCode.value,
      participant_info: {
        name: participantInfo.value.name,
        phone: participantInfo.value.phone,
        email: participantInfo.value.email || undefined,
      },
    })

    // 邮箱链接路径 + 活动配置「点击不显示结果」：仅确认参与（结果与 toast 都不在本机展示）
    if (forceOnline && edrawHideResult.value) {
      edrawConfirmedNotice.value = true
      return
    }

    // 统一处理抽奖结果
    lotteryResult.value = {
      is_winner: drawResponse.is_winner || false,
      is_demo: drawResponse.is_demo === true,
      prize: drawResponse.prize || null,
      lottery_record: drawResponse.lottery_record || null,
      lottery_code: drawResponse.lottery_code || null,
    }

    showResult.value = true

    // 线下抽奖且开启签字：结果弹窗提供「去签字」按钮，手动点击后进入必签流程。
    // 未中奖不需要签字（记录留为未签，可经记录页补签）
    const isOffline = activityInfo.value?.lottery_mode === 'offline'
    const requireSignature = activityInfo.value?.settings?.require_signature === true
    const recordId = drawResponse.lottery_record?.id
    const isWinner = drawResponse.is_winner === true
    pendingSignature.value = !!(isOffline && requireSignature && recordId && isWinner)
    if (recordId) currentRecordId.value = recordId

    // 显示抽奖结果提示
    if (lotteryResult.value?.is_winner && lotteryResult.value?.prize) {
      toast.success(`🎉 恭喜您抽中了：${lotteryResult.value.prize.name}！`)
    } else {
      toast.info('很遗憾，本次未中奖，请再接再厉！')
    }

    // 清空输入（撤销凭证先留存本次抽奖码）
    lastDrawnCode.value = lotteryCode.value
    lotteryCode.value = ''
    if (activityInfo.value?.lottery_mode === 'online') {
      participantInfo.value = { name: '', phone: '', email: '' }
    }
  } catch (err) {
    // 抽奖失败

    // 解析API返回的错误信息
    let errorMessage = '抽奖失败，请稍后重试'
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (
        err as { response?: { data?: { error?: { message?: string; details?: string } } } }
      ).response
      if (response?.data?.error) {
        const apiError = response.data.error
        errorMessage = apiError.message || errorMessage
        if (apiError.details) {
          errorMessage += ` (${apiError.details})`
        }
      }
    } else if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as { message: string }).message
    }

    toast.error(errorMessage)
  } finally {
    isDrawing.value = false
  }
}

// 关闭结果弹窗
const closeResult = () => {
  showResult.value = false
  lotteryResult.value = null
  pendingSignature.value = false
  resultFromPoll.value = false
}

// 结果弹窗的关闭请求拦截：ESC/遮罩等提前退出 ≠ 直接关闭，
// 一律先经「确认撤销」弹窗（确认后走撤销接口复原库存/码/记录）
const handleResultCloseRequest = (open: boolean) => {
  if (!open && showResult.value && !resultFromPoll.value) {
    showUndoConfirm.value = true
    return
  }
  showResult.value = open
}

// 确定：保留结果离开（不撤销）
const keepResult = () => {
  closeResult()
}

// 确认撤销本次抽奖：恢复库存/码/删记录；抽奖码回填便于重试
const handleUndoConfirm = async () => {
  if (!currentRecordId.value || !lastDrawnCode.value) {
    // 无记录可撤销（理论上不可达）：按关闭处理
    showUndoConfirm.value = false
    closeResult()
    return
  }

  undoing.value = true
  try {
    await lotteryApi.undoDraw(activityId, {
      record_id: currentRecordId.value,
      lottery_code: lastDrawnCode.value,
    })

    showUndoConfirm.value = false
    showSignature.value = false
    closeResult()
    currentRecordId.value = null
    // 回填本次抽奖码（线上模式还需补参与者信息），便于修正后重新参与
    lotteryCode.value = lastDrawnCode.value
    toast.success('已撤销本次抽奖，抽奖码恢复可用')
  } catch (err) {
    let errorMessage = '撤销失败，请重试'
    if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as { message: string }).message
    }
    toast.error(errorMessage)
  } finally {
    undoing.value = false
  }
}

// ---- 邮箱即抽：提交前缀 → 发确认邮件 → 长轮询等结果 ----
const handleRequestEmailDraw = async () => {
  const prefix = emailPrefix.value.trim().toLowerCase()
  if (!prefix) return
  if (!/^[a-z0-9._-]{1,64}$/.test(prefix)) {
    toast.error('邮箱前缀仅支持字母、数字、点、下划线、连字符')
    return
  }

  try {
    isDrawing.value = true
    const res = await lotteryApi.requestEmailDraw(activityId, prefix)
    emailDrawEmail.value = res.email
    emailDrawWaiting.value = true
    toast.success(`确认邮件已发送至 ${res.email}`)
    startEmailPolling(res.email)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '发送确认邮件失败')
  } finally {
    isDrawing.value = false
  }
}

const startEmailPolling = async (email: string) => {
  emailPollStopped = false
  emailPolling.value = true
  try {
    while (!emailPollStopped && emailDrawWaiting.value) {
      // 服务端长轮询（最长挂 20s）；返回 drawn 即渲染结果
      const status = await lotteryApi.emailDrawStatus(activityId, email, true)
      if (emailPollStopped) return
      if (status.state === 'drawn' && status.result) {
        emailDrawWaiting.value = false
        // 复用结果弹窗（本机无抽奖码：不显示撤销、关闭不需确认）
        resultFromPoll.value = true
        lotteryResult.value = {
          is_winner: status.result.is_winner,
          prize: (status.result.prize as unknown as Prize) ?? null,
          lottery_code: null,
          lottery_record: null,
        }
        pendingSignature.value = false
        showResult.value = true
        toast.success(
          status.result.is_winner ? '🎉 邮箱确认完成，恭喜中奖！' : '邮箱确认完成，本次未中奖',
        )
        return
      }
    }
  } catch {
    // 轮询网络异常：回到输入态让用户重试
    if (!emailPollStopped) {
      emailDrawWaiting.value = false
      toast.error('结果查询中断，请重新提交或检查邮箱链接')
    }
  } finally {
    emailPolling.value = false
  }
}

const cancelEmailWait = () => {
  emailPollStopped = true
  emailDrawWaiting.value = false
  emailPolling.value = false
}

// 从结果弹窗进入签字（手动触发）
const goSignature = () => {
  showResult.value = false
  showSignature.value = true
}

// 签字确认（提交成功才关闭；失败保持弹窗可重试）
const handleSignatureConfirm = async (dataUrl: string) => {
  if (!currentRecordId.value || !activityId) return

  isSubmittingSignature.value = true
  signatureError.value = ''

  try {
    await adminActivityApi.uploadSignature(activityId, currentRecordId.value, {
      image: dataUrl,
      // 公开签字凭证：本次抽奖码（管理员 token 存在时后端走管理员通道，无需它）
      lottery_code: lastDrawnCode.value || undefined,
    })
    toast.success('签字提交成功')
    showSignature.value = false
    currentRecordId.value = null
    lotteryResult.value = null
    pendingSignature.value = false
  } catch (err) {
    let errorMessage = '签字上传失败，请重试'
    if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as { message: string }).message
    }
    signatureError.value = errorMessage
    toast.error(errorMessage)
  } finally {
    isSubmittingSignature.value = false
  }
}

// 组件挂载时加载数据；邮件链接（?edraw=）在活动加载后自动执行抽奖
onMounted(async () => {
  await loadActivityInfo()
  if (edrawCode && activityInfo.value) {
    // 邮件链接路径：无视活动模式走公开 draw（offline 亦无需管理员登录）
    await handleDraw({ forceOnline: true })
  }
})

onUnmounted(() => {
  emailPollStopped = true
})
</script>

<style scoped>
/* 左侧盒子1样式 - 去除边框和阴影 */
.lottery-box-one {
  border: none;
  box-shadow: none;
}

/* 数字键盘盒子样式 - 增加圆角、边框和阴影 */
.keyboard-box {
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.lottery-container {
  min-height: 100vh;
  background: white;
  padding: 20px;
}

.lottery-content {
  max-width: 1200px;
  gap: 2rem;
}

.lottery-box {
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  backdrop-filter: blur(10px);
}

.activity-title {
  font-size: 2rem;
  font-weight: bold;
  color: #2d3748;
  margin-bottom: 0.5rem;
}

.activity-description {
  color: #718096;
  margin-bottom: 2rem;
}

.input-group {
  margin-bottom: 1.5rem;
}

.input-label {
  display: block;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.lottery-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1.1rem;
  text-align: center;
  letter-spacing: 2px;
  transition: all 0.3s ease;
}

.lottery-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  outline: none;
}

.draw-button {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.draw-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #ff5252 0%, #ff7979 100%);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3);
}

.draw-button:disabled {
  background: #cbd5e0;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.keyboard-container {
  width: 100%;
  max-width: 300px;
}

.keyboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.keyboard-button {
  aspect-ratio: 1;
  background: #f7fafc;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 1.5rem;
  font-weight: 600;
  color: #2d3748;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.keyboard-button:hover {
  background: #edf2f7;
  border-color: #cbd5e0;
  transform: translateY(-1px);
}

.keyboard-button:active {
  transform: translateY(0);
}

.keyboard-button.delete {
  background: #fed7d7;
  border-color: #feb2b2;
  color: #c53030;
}

.keyboard-button.delete:hover {
  background: #fbb6ce;
  border-color: #f687b3;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e2e8f0;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.error-message {
  background: #fed7d7;
  color: #c53030;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  text-align: center;
}

.result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.result-modal {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.result-title {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.result-title.winner {
  color: #38a169;
}

.result-title.no-prize {
  color: #e53e3e;
}

.prize-info {
  background: #f0fff4;
  border: 2px solid #9ae6b4;
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}

.prize-name {
  font-size: 1.2rem;
  font-weight: 600;
  color: #2f855a;
  margin-bottom: 0.5rem;
}

.close-button {
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 1rem;
  transition: background 0.3s ease;
}

.close-button:hover {
  background: #5a67d8;
}

/* 抽奖码输入框样式 - 桌面端和平板端去除边框 */
@media (min-width: 768px) {
  .lottery-code-input {
    border: none !important;
    box-shadow: none !important;
  }

  .lottery-code-input:focus {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
  }
}

/* 媒体查询 - 只在桌面端和平板端显示键盘 */
@media (max-width: 768px) {
  .keyboard-container {
    display: none !important;
  }

  .lottery-content {
    flex-direction: column;
    gap: 1rem;
  }

  .lottery-box {
    padding: 1.5rem;
  }
}

@media (min-width: 769px) {
  .lottery-content {
    flex-direction: row;
    align-items: flex-start;
  }

  .lottery-box:first-child {
    flex: 1;
    max-width: 500px;
  }
}
</style>
