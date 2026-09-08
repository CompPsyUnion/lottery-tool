<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import API from '@/api'

const emits = defineEmits<{
  (e: 'submit', payload: { username: string; password: string }): void
}>()

const username = ref('')
const password = ref('')
// 注册入口开关：系统未初始化（待首位超管注册）或注册开放时显示
const showSignup = ref(false)

onMounted(async () => {
  try {
    const status = await API.auth.registrationStatus()
    showSignup.value = !status.initialized || status.registration_enabled
  } catch {
    showSignup.value = true // 状态获取失败时保守显示，后端仍会拦截
  }
})

const onSubmit = (e: Event) => {
  e.preventDefault()
  emits('submit', { username: username.value, password: password.value })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <form @submit="onSubmit">
      <div class="flex flex-col gap-6">
        <div class="flex flex-col items-center gap-2">
          <h1 class="text-xl font-bold">Lottery Tool</h1>
          <div v-if="showSignup" class="text-center text-sm">
            Don't have an account?
            <RouterLink :to="{ name: 'Register' }" class="underline underline-offset-4">
              Sign up
            </RouterLink>
          </div>
        </div>
        <div class="flex flex-col gap-6">
          <div class="grid gap-2">
            <Label html-for="username">Username</Label>
            <Input
              id="username"
              v-model="username"
              type="text"
              placeholder="your username"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label html-for="password">Password</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              placeholder="Enter your password"
              required
            />
          </div>
          <Button type="submit" class="w-full"> Login </Button>
        </div>
      </div>
    </form>
    <div
      class="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary"
    >
      By clicking continue, you agree to our <a href="#">Terms of Service</a> and
      <a href="#">Privacy Policy</a>.
    </div>
  </div>
</template>
