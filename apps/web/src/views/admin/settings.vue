<template>
  <div>
    <PageTitle :title="'Settings'" />
    <div class="text-sm text-muted-foreground">
      系统级设置由超级管理员管理（侧边栏 Settings → Super）。
    </div>
  </div>
</template>

<script setup lang="ts">
import PageTitle from '@/components/ui/text/pageTitle.vue'
</script>
