<script setup lang="ts">
/**
 * 抽奖页面测试 Dialog（共用组件）：幂等获取活动测试码 + 预填链接。
 * 活动列表行操作与活动详情页两个入口共用。
 */
import { computed, ref, watch } from 'vue'
import { Play } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { adminActivityApi } from '@/api'

const props = defineProps<{
  open: boolean
  activityId: number | null
}>()

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const demoLoading = ref(false)
const demoError = ref('')
const demoCode = ref('')

const demoUrl = computed(
  () => `${location.origin}/lottery?activityId=${props.activityId}&code=${demoCode.value}`,
)

// 打开时获取测试码（后端幂等：活动固定一个）
watch(
  () => props.open,
  async (open) => {
    if (!open || !props.activityId) return
    demoLoading.value = true
    demoError.value = ''
    demoCode.value = ''
    try {
      const res = await adminActivityApi.ensureDemoCode(props.activityId)
      demoCode.value = res.lottery_code.code
    } catch (error) {
      demoError.value = error instanceof Error ? error.message : '获取测试抽奖码失败'
    } finally {
      demoLoading.value = false
    }
  },
)

const copyText = async (text: string, successMessage: string) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      // 非安全上下文（如局域网 http）回退：隐藏 textarea + execCommand
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

const openDemoUrl = () => {
  window.open(demoUrl.value, '_blank')
}
</script>

<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogScrollContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>抽奖页面测试</DialogTitle>
        <DialogDescription>
          使用测试抽奖码在真实抽奖页体验完整流程（含签字）：不扣减奖品库存，测试记录不计入统计，可反复抽。
        </DialogDescription>
      </DialogHeader>

      <div v-if="demoLoading" class="py-6 text-center text-sm text-muted-foreground">
        正在准备测试抽奖码...
      </div>
      <div v-else-if="demoError" class="py-6 text-center text-sm text-destructive">
        {{ demoError }}
      </div>
      <div v-else-if="demoCode" class="space-y-4">
        <div class="space-y-1.5">
          <div class="text-xs text-muted-foreground">测试抽奖码（活动固定一个，可反复使用）</div>
          <div class="flex flex-wrap items-center gap-2">
            <code
              class="min-w-0 flex-1 basis-40 rounded-md border bg-muted px-3 py-2 text-center font-mono text-lg font-bold tracking-widest break-all"
            >
              {{ demoCode }}
            </code>
            <Button
              variant="outline"
              size="sm"
              class="shrink-0"
              @click="copyText(demoCode, '抽奖码已复制')"
            >
              复制
            </Button>
          </div>
        </div>

        <div class="space-y-1.5">
          <div class="text-xs text-muted-foreground">抽奖页链接（自动填入测试码）</div>
          <!-- break-all 换行显示完整链接：不依赖 flex 收缩链，天然不溢出 -->
          <div class="flex flex-wrap items-center gap-2">
            <code
              class="min-w-0 flex-1 basis-40 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all"
            >
              {{ demoUrl }}
            </code>
            <Button
              variant="outline"
              size="sm"
              class="shrink-0"
              @click="copyText(demoUrl, '链接已复制')"
            >
              复制
            </Button>
          </div>
          <Button class="w-full" @click="openDemoUrl">
            <Play class="mr-1 h-4 w-4" />
            打开抽奖页
          </Button>
        </div>

        <p class="text-xs leading-relaxed text-muted-foreground">
          提示：测试码无视活动状态与起止时间，任意阶段均可测试抽奖；线下抽奖模式需管理员登录后操作。
        </p>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>
