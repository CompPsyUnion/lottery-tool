<template>
  <div class="flex md:gap-4 gap-2 items-center py-2 px-4 border-foreground/10 border rounded-md">
    <!-- 图标 -->
    <div 
      class="flex items-center justify-center bg-gray-100 rounded-md p-2 size-10"
    >
      <component :is="icon" class="size-4" />
    </div>
    <!-- 正文 -->
    <div>
      <h4 class="text-sm text-gray-500">{{ title }}</h4>
      <h1 class="text-2xl font-bold">{{ value }}</h1>
    </div> 
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  title: string
  value: number | string
  icon: Component | string
}>();
</script>