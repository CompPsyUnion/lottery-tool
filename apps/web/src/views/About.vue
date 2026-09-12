<template>
  <div class="about px-4 py-2">
    <Breadcrumbs />
    <h1 class="text-2xl font-semibold mt-2">关于我们</h1>
    <p class="text-muted-foreground">这是一个简单的抽奖工具应用。</p>
    <p class="text-muted-foreground">使用 Vue 3 + TypeScript + Vite 构建。</p>
  </div>
</template>

<script setup lang="ts">
import Breadcrumbs from '@/components/navigation/Breadcrumbs.vue';
</script>

<style scoped>
/* Page specific styles can go here if needed */
</style>
