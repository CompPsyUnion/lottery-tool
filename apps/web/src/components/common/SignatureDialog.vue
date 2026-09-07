<template>
  <Dialog :open="visible" @update:open="handleOpenChange">
    <DialogContent
      class="max-w-2xl mx-4 rounded-2xl border-0 shadow-2xl"
      :show-close-button="dismissible !== false"
      @escape-key-down="dismissible === false && $event.preventDefault()"
      @pointer-down-outside="dismissible === false && $event.preventDefault()"
      @interact-outside="dismissible === false && $event.preventDefault()"
    >
      <DialogHeader class="pb-4">
        <DialogTitle class="text-xl font-bold text-center"> 请在下方区域签字 </DialogTitle>
        <DialogDescription class="text-center text-sm text-gray-500">
          {{
            dismissible
              ? '请使用鼠标或触屏在下方区域完成签字，签字后点击确认提交'
              : '本次抽奖需要签字确认后才能完成，请使用鼠标或触屏在下方区域签字'
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- 签字画布区域 -->
        <div
          class="relative border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden touch-none"
          :style="{ height: canvasHeight + 'px' }"
        >
          <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" />
          <div
            v-if="isEmpty"
            class="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <span class="text-gray-300 text-lg">在此处签字</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex items-center justify-between gap-3">
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              :disabled="!canUndo || isSubmitting"
              @click="handleUndo"
            >
              <Undo2 class="w-4 h-4 mr-1" />
              撤销
            </Button>
            <Button
              type="button"
              variant="outline"
              :disabled="isEmpty || isSubmitting"
              @click="handleClear"
            >
              <Eraser class="w-4 h-4 mr-1" />
              清空
            </Button>
          </div>

          <div class="flex gap-2">
            <Button
              v-if="dismissible"
              type="button"
              variant="outline"
              :disabled="isSubmitting"
              @click="handleCancel"
            >
              取消
            </Button>
            <Button
              type="button"
              :disabled="isEmpty || isSubmitting"
              class="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              @click="handleConfirm"
            >
              <Loader2 v-if="isSubmitting" class="w-4 h-4 mr-1 animate-spin" />
              <Check v-else class="w-4 h-4 mr-1" />
              {{ isSubmitting ? '提交中...' : '确认签字' }}
            </Button>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMessage" class="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg">
          {{ errorMessage }}
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import SignaturePad from 'signature_pad'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Undo2, Eraser, Check, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  isSubmitting?: boolean
  errorMessage?: string
  /** false = 必签模式：无取消按钮、禁 ESC/遮罩/关闭按钮，仅提交成功后由父组件关闭 */
  dismissible?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', dataUrl: string): void
  (e: 'cancel'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const signaturePad = ref<SignaturePad | null>(null)
const isEmpty = ref(true)
const canUndo = ref(false)
const canvasHeight = ref(280)
const history = ref<string[]>([])

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  const rect = canvas.getBoundingClientRect()

  canvas.width = rect.width * ratio
  canvas.height = rect.height * ratio

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(ratio, ratio)
  }

  // 重新初始化 signature_pad
  if (signaturePad.value) {
    const data = signaturePad.value.toData()
    signaturePad.value = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
      minWidth: 1,
      maxWidth: 3,
    })
    if (data && data.length > 0) {
      signaturePad.value.fromData(data)
    }
    syncState()
  }
}

/**
 * 实时同步签字状态。signature_pad 5.x 已移除 options 的 onEnd 回调，
 * 也没有 stroke 事件——在 canvas 上监听 pointerup 自行同步（此前依赖
 * onEnd 导致 isEmpty 永远为 true，确认按钮恒灰）。
 */
function syncState() {
  const pad = signaturePad.value
  if (!pad) return
  isEmpty.value = pad.isEmpty()
  canUndo.value = pad.toData().length > 0
  // 每笔结束入撤销历史
  if (!isEmpty.value) saveState()
}

function saveState() {
  if (signaturePad.value) {
    const data = signaturePad.value.toData()
    history.value.push(JSON.stringify(data))
    if (history.value.length > 50) {
      history.value.shift()
    }
  }
}

function initSignaturePad() {
  const canvas = canvasRef.value
  if (!canvas) return

  // 防止 watch(visible) 重复 init 时重复挂载
  removeStrokeListeners()

  signaturePad.value = new SignaturePad(canvas, {
    backgroundColor: 'rgb(255, 255, 255)',
    penColor: 'rgb(0, 0, 0)',
    minWidth: 1,
    maxWidth: 3,
  })

  // 5.x 无 onEnd/stroke 事件：以 pointer 抬起同步状态。
  // 库的 move/up 监听挂 window（出画布抬起也能结束笔画），因此状态同步
  // 同样挂 window——若只挂 canvas，一笔在框外结束时收不到 pointerup，
  // 确认按钮会保持灰色（"这一笔无法结束"）。canvas pointerdown 标记起笔，
  // window pointerup/pointercancel 时同步，避免无关全局指针事件干扰。
  canvas.addEventListener('pointerdown', handleStrokeStart)
  window.addEventListener('pointerup', handleStrokeEnd)
  window.addEventListener('pointercancel', handleStrokeEnd)

  isEmpty.value = true
  canUndo.value = false
  history.value = []
}

let strokeActive = false

function handleStrokeStart() {
  strokeActive = true
}

function handleStrokeEnd() {
  if (!strokeActive) return
  strokeActive = false
  syncState()
}

function removeStrokeListeners() {
  const canvas = canvasRef.value
  canvas?.removeEventListener('pointerdown', handleStrokeStart)
  window.removeEventListener('pointerup', handleStrokeEnd)
  window.removeEventListener('pointercancel', handleStrokeEnd)
  strokeActive = false
}

function handleClear() {
  if (signaturePad.value) {
    signaturePad.value.clear()
    isEmpty.value = true
    canUndo.value = false
    history.value = []
  }
}

function handleUndo() {
  if (history.value.length > 0 && signaturePad.value) {
    history.value.pop()
    if (history.value.length > 0) {
      const data = JSON.parse(history.value[history.value.length - 1])
      signaturePad.value.fromData(data)
      isEmpty.value = false
    } else {
      signaturePad.value.clear()
      isEmpty.value = true
      canUndo.value = false
    }
  }
}

function handleConfirm() {
  if (signaturePad.value && !signaturePad.value.isEmpty()) {
    const dataUrl = signaturePad.value.toDataURL('image/png')
    emit('confirm', dataUrl)
  }
}

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}

function handleOpenChange(open: boolean) {
  // 必签模式拦截一切关闭请求（ESC/遮罩/按钮），仅父组件提交成功后程序化关闭
  if (!open && props.dismissible === false) return
  emit('update:visible', open)
  if (!open && props.dismissible !== false) {
    emit('cancel')
  }
}

function handleResize() {
  resizeCanvas()
}

watch(
  () => props.visible,
  async (newVal) => {
    if (newVal) {
      await nextTick()
      initSignaturePad()
      resizeCanvas()
    } else {
      removeStrokeListeners()
    }
  },
)

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  removeStrokeListeners()
})
</script>

<style scoped>
.touch-none {
  touch-action: none;
}
</style>
