<template>
  <!-- 品牌位（与管理端侧栏同款）：固定左上角，点击回主页 -->
  <button
    type="button"
    class="absolute left-4 top-4 z-10 flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-black/5"
    title="回到首页"
    @click="router.push('/')"
  >
    <img
      src="/favicon.jpeg"
      alt="Lottery Tool"
      class="aspect-square size-8 rounded-lg object-cover"
    />
    <span class="grid text-sm leading-tight">
      <span class="truncate font-semibold text-gray-800">Lottery Tool</span>
      <span class="truncate text-xs text-gray-400">抽奖系统</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>
