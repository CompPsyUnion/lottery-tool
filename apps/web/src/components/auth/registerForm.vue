<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import API from '@/api'

const emits = defineEmits<{
  (
    e: 'submit',
    payload: { username: string; email: string; password: string; code?: string; session?: string },
  ): void
}>()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const verificationCode = ref('')
const error = ref('')

// 注册是否开放；系统未初始化（待首位超管）时恒开放且无需验证码
const registrationOpen = ref(true)
const needCode = ref(false)
const loaded = ref(false)

// 验证码流：session 令牌（sessionStorage 持久，刷新不丢）+ 倒计时
const session = ref('')
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const startCountdown = (seconds: number) => {
  countdown.value = seconds
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

const ensureSession = (): string => {
  if (!session.value) {
    session.value =
      sessionStorage.getItem('register_session') ||
      `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem('register_session', session.value)
  }
  return session.value
}

onMounted(async () => {
  ensureSession()
  try {
    const status = await API.auth.registrationStatus()
    registrationOpen.value = !status.initialized || status.registration_enabled
    // 已初始化且注册开放 → 公开注册需要邮箱验证码
    needCode.value = status.initialized && status.registration_enabled
  } catch {
    registrationOpen.value = true
    needCode.value = true // 保守：要求验证码，后端会给出准确错误
  } finally {
    loaded.value = true
  }
})

const sendCode = async () => {
  if (!email.value || countdown.value > 0) return
  try {
    const res = await API.auth.sendCode({ email: email.value, session: ensureSession() })
    startCountdown(60)
    toastCodeSent(res.ttl_minutes)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '验证码发送失败'
  }
}

const toastCodeSent = (ttl: number) => {
  // 简单行内提示（避免引入额外依赖）
  error.value = ''
  codeHint.value = `验证码已发送至 ${email.value}（${ttl} 分钟内有效）`
}

const codeHint = ref('')

const validate = (): boolean => {
  codeHint.value = ''
  if (!/^[a-zA-Z0-9_]{3,50}$/.test(username.value)) {
    error.value = '用户名需为 3-50 位字母、数字或下划线'
    return false
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    error.value = '请输入有效的邮箱地址'
    return false
  }
  if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(password.value)) {
    error.value = '密码至少 6 位且需包含字母和数字'
    return false
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return false
  }
  if (needCode.value && !/^\d{6}$/.test(verificationCode.value)) {
    error.value = '请输入 6 位邮箱验证码'
    return false
  }
  error.value = ''
  return true
}

const onSubmit = (e: Event) => {
  e.preventDefault()
  if (validate()) {
    emits('submit', {
      username: username.value,
      email: email.value,
      password: password.value,
      ...(needCode.value ? { code: verificationCode.value, session: session.value } : {}),
    })
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <form @submit="onSubmit">
      <div class="flex flex-col gap-6">
        <div class="flex flex-col items-center gap-2">
          <h1 class="text-xl font-bold">Lottery Tool</h1>
          <div class="text-center text-sm">
            Already have an account?
            <RouterLink :to="{ name: 'Login' }" class="underline underline-offset-4">
              Log in
            </RouterLink>
          </div>
        </div>

        <!-- 注册已关闭 -->
        <div v-if="loaded && !registrationOpen" class="text-center text-sm text-muted-foreground">
          系统已关闭注册，请联系管理员开通账户。
        </div>

        <div v-else class="flex flex-col gap-6">
          <div class="grid gap-2">
            <Label html-for="username">Username</Label>
            <Input
              id="username"
              v-model="username"
              type="text"
              placeholder="3-50 位字母、数字或下划线"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label html-for="email">Email</Label>
            <Input id="email" v-model="email" type="email" placeholder="you@example.com" required />
          </div>

          <!-- 邮箱验证码（已初始化系统） -->
          <div v-if="needCode" class="grid gap-2">
            <Label html-for="verification-code">验证码</Label>
            <div class="flex gap-2">
              <Input
                id="verification-code"
                v-model="verificationCode"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="6 位数字"
                class="flex-1"
                required
              />
              <Button
                type="button"
                variant="outline"
                :disabled="countdown > 0 || !email"
                class="shrink-0 whitespace-nowrap"
                @click="sendCode"
              >
                {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
              </Button>
            </div>
            <p v-if="codeHint" class="text-xs text-muted-foreground">{{ codeHint }}</p>
          </div>

          <div class="grid gap-2">
            <Label html-for="password">Password</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              placeholder="至少 6 位，包含字母和数字"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label html-for="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              placeholder="再输入一次密码"
              required
            />
          </div>
          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
          <Button type="submit" class="w-full"> Sign up </Button>
        </div>
      </div>
    </form>
    <div class="text-balance text-center text-xs text-muted-foreground">
      首位注册的用户将自动成为超级管理员；系统完成初始化后，注册需邮箱验证码且开放与否由管理员设置。
    </div>
  </div>
</template>
