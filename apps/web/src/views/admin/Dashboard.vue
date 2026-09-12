<template>
  <PageTitle
    :title="'Dashboard'"
    :subTitle="'Welcome to the admin dashboard'"
  />
  <!-- 顶部数据卡片 -->
  <div class="grid md:grid-cols-4 grid-cols-2 gap-4 py-4">
    <NumberCard :title="cardLabels.activities" :value="dashboardStats.total_activities" :icon="Users" />
    <NumberCard :title="cardLabels.lotteryCodes" :value="dashboardStats.total_lottery_codes" :icon="ShoppingCart" />
    <NumberCard :title="cardLabels.users" :value="dashboardStats.total_users" :icon="Users" />
    <NumberCard :title="cardLabels.records" :value="dashboardStats.total_lottery_records" :icon="Package" />
  </div>
  
  <!-- 活动列表 -->
  <div class="grid lg:grid-cols-2 grid-cols-1 gap-8 py-4">
    <!-- 进行中的活动 -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="scroll-m-20 text-xl font-semibold tracking-tight">
          进行中的活动
        </h3>
        <Button variant="outline" size="sm" @click="$router.push('/admin/activities/list')">
          查看全部
        </Button>
      </div>
      
      <div v-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="border rounded-lg p-4">
          <div class="animate-pulse">
            <div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
      
      <div v-else-if="activeActivities.length === 0" class="text-center py-8 text-muted-foreground">
        <Activity class="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>暂无进行中的活动</p>
      </div>
      
      <div v-else class="space-y-4">
        <ActivityCard 
          v-for="activity in activeActivities" 
          :key="activity.id" 
          :activity="activity"
          show-mode="active"
          @click="handleActivityClick"
        />
      </div>
    </div>
    
    <!-- 最近创建的活动 -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="scroll-m-20 text-xl font-semibold tracking-tight">
          最近创建的活动
        </h3>
        <Button variant="outline" size="sm" @click="$router.push('/admin/activities/create')">
          创建活动
        </Button>
      </div>
      
      <div v-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="border rounded-lg p-4">
          <div class="animate-pulse">
            <div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
      
      <div v-else-if="recentActivities.length === 0" class="text-center py-8 text-muted-foreground">
        <Plus class="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>暂无最近创建的活动</p>
      </div>
      
      <div v-else class="space-y-4">
        <ActivityCard 
          v-for="activity in recentActivities" 
          :key="activity.id" 
          :activity="activity"
          show-mode="recent"
          @click="handleActivityClick"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import PageTitle from '@/components/ui/text/pageTitle.vue';
import NumberCard from '@/components/admin/dashboard/numberCard.vue';
import ActivityCard from '@/components/admin/dashboard/ActivityCard.vue';
import { Button } from '@/components/ui/button';
import { Users, ShoppingCart, Package, Activity, Plus } from 'lucide-vue-next';
import { API } from '@/api';
import type { Activity as ActivityType } from '@/types/api';

const router = useRouter();

// 响应式数据
const loading = ref(false);
const activeActivities = ref<ActivityType[]>([]);
const recentActivities = ref<ActivityType[]>([]);
const isSupperAdmin = ref(false);
const dashboardStats = ref({
  total_users: 0,
  total_activities: 0,
  total_lottery_codes: 0,
  total_lottery_records: 0,
});

// 数字卡片标签，根据用户角色显示不同内容
const cardLabels = computed(() => {
  if (isSupperAdmin.value) {
    return {
      activities: '总活动数',
      lotteryCodes: '总抽奖码数',
      users: '管理员数',
      records: '抽奖记录数',
    };
  } else {
    return {
      activities: '我的活动',
      lotteryCodes: '我的抽奖码',
      users: '总用户数',
      records: '我的记录',
    };
  }
});

// 获取仪表板统计数据
const fetchDashboardStats = async () => {
  try {
    const data = await API.stats.getDashboardStats();
    
    // 根据返回的数据字段判断用户角色
    if (data.totalActivities !== undefined) {
      // 超级管理员数据
      isSupperAdmin.value = true;
      dashboardStats.value = {
        total_users: data.totalAdmins || 0,
        total_activities: data.totalActivities || 0,
        total_lottery_codes: data.totalLotteryCodes || 0,
        total_lottery_records: data.totalLotteryRecords || 0,
      };
    } else {
      // 管理员数据
      isSupperAdmin.value = false;
      dashboardStats.value = {
        total_users: data.totalUsers || 0,
        total_activities: data.userActivities || 0,
        total_lottery_codes: data.userLotteryCodes || 0,
        total_lottery_records: data.userLotteryRecords || 0,
      };
    }
  } catch {
    dashboardStats.value = {
      total_users: 0,
      total_activities: 0,
      total_lottery_codes: 0,
      total_lottery_records: 0,
    };
  }
};

// 获取进行中的活动
const fetchActiveActivities = async () => {
  try {
    const response = await API.adminActivity.getActivities({
      status: 'active',
      limit: 5,
    });
    activeActivities.value = response.activities;
  } catch {
    // 获取进行中活动失败，设置为空数组
    activeActivities.value = [];
  }
};

// 获取最近创建的活动
const fetchRecentActivities = async () => {
  try {
    const response = await API.adminActivity.getActivities({
      limit: 5,
    });
    recentActivities.value = response.activities;
  } catch {
    // 获取最近活动失败，设置为空数组
    recentActivities.value = [];
  }
};

// 处理活动点击事件
const handleActivityClick = (activity: ActivityType) => {
  router.push(`/admin/activities/detail/${activity.id}`);
};

// 获取所有数据
const fetchAllData = async () => {
  loading.value = true;
  try {
    await Promise.all([
      fetchDashboardStats(),
      fetchActiveActivities(),
      fetchRecentActivities(),
    ]);
  } finally {
    loading.value = false;
  }
};

// 组件挂载时获取数据
onMounted(() => {
  fetchAllData();
});
</script>