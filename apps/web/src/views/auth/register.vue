<template>
  <div class="flex min-h-svh w-full items-center justify-center px-8">
    <RegisterForm @submit="handleRegister" />
  </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'
import RegisterForm from '@/components/auth/registerForm.vue'
import API from '@/api'
import { toast } from 'vue-sonner'

const router = useRouter()

const handleRegister = async (values: {
  username: string
  email: string
  password: string
  code?: string
  session?: string
}) => {
  try {
    const res = await API.auth.register(values)
    // 后端语义：首位注册者自动成为超级管理员，之后按系统注册开关放行为普通管理员
    toast.success(
      res.user?.role === 'super_admin' ? '注册成功，您是首位用户，已成为超级管理员' : '注册成功',
    )
    await router.replace({ name: 'Login' })
  } catch (err) {
    toast.error(
      typeof err === 'string' ? err : err instanceof Error ? err.message : '注册失败，请稍后再试',
    )
  }
}
</script>
