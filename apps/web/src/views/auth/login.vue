<template>
  <div class="flex min-h-svh w-full items-center justify-center px-8">
    <LoginForm 
      @submit="handleLogin"
    />
  </div>
</template>

<script lang="ts" setup>
import { useRoute, useRouter } from 'vue-router';
import LoginForm from '@/components/auth/loginForm.vue';
import API, { setAuthToken } from '@/api';
import { useUserStore } from '@/stores/user';
import { toast } from 'vue-sonner';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const handleLogin = async (values: { username: string; password: string }) => {
  try {
    const { token } = await API.auth.login(values);
    setAuthToken(token);
    userStore.setToken(token);

    const backurlRaw = route.query.backurl;
    const backurl = Array.isArray(backurlRaw) ? backurlRaw[0] : backurlRaw;
    const decoded = backurl ? decodeURIComponent(backurl) : '';

    if (decoded && decoded.startsWith('/')) {
      await router.replace(decoded);
    } else {
      await router.replace({ name: 'Dashboard' });
    }
  } catch (err) {
    toast.error(typeof err === 'string' ? err : (err instanceof Error ? err.message : '登录失败，请检查用户名或密码'));
  }
};
</script>