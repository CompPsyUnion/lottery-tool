<template>
  <div class="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" @click="$emit('click', activity)">
    <!-- 活动标题和状态 -->
    <div class="flex items-start justify-between mb-2">
      <h4 class="font-semibold text-lg truncate flex-1 mr-2">{{ activity.name }}</h4>
      <div class="flex gap-2 flex-shrink-0">
        <span 
          :class="getStatusBadgeClass(activity.status)"
          class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
        >
          {{ getStatusLabel(activity.status) }}
        </span>
        <span 
          :class="getModeBadgeClass(activity.lottery_mode)"
          class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
        >
          {{ getModeLabel(activity.lottery_mode) }}
        </span>
      </div>
    </div>
    
    <!-- 活动描述 -->
    <p v-if="activity.description" class="text-sm text-muted-foreground mb-3 line-clamp-2">
      {{ activity.description }}
    </p>
    
    <!-- 活动时间信息 -->
    <div class="space-y-1 text-sm text-muted-foreground">
      <div v-if="activity.start_time" class="flex items-center gap-2">
        <Calendar class="h-4 w-4" />
        <span>开始: {{ formatDate(activity.start_time) }}</span>
      </div>
      <div v-if="activity.end_time" class="flex items-center gap-2">
        <Clock class="h-4 w-4" />
        <span>结束: {{ formatDate(activity.end_time) }}</span>
      </div>
      <!-- 根据显示模式显示不同内容 -->
      <div v-if="showMode === 'active'" class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <Users class="h-4 w-4" />
          <span>剩余: {{ activity.remaining_lottery_codes || 0 }} 个</span>
        </div>
        <div class="flex items-center gap-2">
          <Users class="h-4 w-4" />
          <span>已抽取: {{ activity.used_lottery_codes || 0 }} 个</span>
        </div>
      </div>
      <div v-else class="flex items-center gap-2">
        <Users class="h-4 w-4" />
        <span>抽奖码: {{ activity.lottery_codes_count || 0 }} 个</span>
      </div>
    </div>
    
    <!-- 创建时间 -->
    <div class="mt-3 pt-3 border-t text-xs text-muted-foreground">
      创建于 {{ formatDate(activity.created_at) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { Calendar, Clock, Users } from 'lucide-vue-next';
import type { Activity } from '@/types/api';

defineProps<{
  activity: Activity;
  showMode?: 'active' | 'recent'; // 显示模式：active显示剩余/已抽取，recent显示总数
}>();

defineEmits<{
  click: [activity: Activity];
}>();

// 状态标签配置
const getStatusLabel = (status: string) => {
  const statusMap = {
    draft: '草稿',
    active: '进行中',
    ended: '已结束',
  };
  return statusMap[status as keyof typeof statusMap] || status;
};

const getStatusBadgeClass = (status: string) => {
  const statusMap = {
    draft: 'bg-secondary text-secondary-foreground',
    active: 'bg-green-100 text-green-800',
    ended: 'bg-red-100 text-red-800',
  };
  return statusMap[status as keyof typeof statusMap] || 'bg-secondary text-secondary-foreground';
};

// 模式标签配置
const getModeLabel = (mode: string) => {
  const modeMap = {
    online: '线上',
    offline: '线下',
  };
  return modeMap[mode as keyof typeof modeMap] || mode;
};

const getModeBadgeClass = (mode: string) => {
  const modeMap = {
    online: 'bg-blue-100 text-blue-800',
    offline: 'bg-purple-100 text-purple-800',
  };
  return modeMap[mode as keyof typeof modeMap] || 'bg-secondary text-secondary-foreground';
};

// 时间格式化
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>