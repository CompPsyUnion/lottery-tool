<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Component } from 'vue';
import type { SidebarProps } from '../ui/sidebar';
import NavMain from '@/components/admin/NavMain.vue';
import NavUser from '@/components/admin/NavUser.vue';
import { Bot, Sparkles, Settings2, Users } from 'lucide-vue-next';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from '../ui/sidebar';
import { authApi } from '@/api';

// 用户信息类型
interface User {
  name: string;
  email: string;
  avatar: string;
  role: string;
}

// 导航栏项类型
interface NavMainItem {
  title: string;
  url: string;
  icon?: Component;
  items?: Array<{
    title: string;
    url: string;
  }>;
}

// 初始化侧边栏数据
const data = ref<{
  user: User;
  navMain: Array<NavMainItem>;
}>({
  user: {
    name: '',
    email: '',
    avatar: '',
    role: '',
  },
  navMain: [
    {
      title: 'Dashboard',
      url: '/admin',
      icon: Bot,
    },
    {
      title: 'Activities',
      url: '/admin/activities/list',
      icon: Sparkles,
      items: [
        {
          title: 'All',
          url: '/admin/activities/list',
        },
        {
          title: 'Create',
          url: '/admin/activities/create',
        },
      ],
    },
    {
      title: 'Users',
      url: '/admin/users',
      icon: Users,
      items: [
        {
          title: 'List',
          url: '/admin/users/list',
        },
        {
          title: 'Add',
          url: '/admin/users/add',
        },
      ],
    },
    {
      title: 'Settings',
      url: '#',
      icon: Settings2,
      items: [
        {
          title: 'General',
          url: '/admin/settings',
        },
      ],
    },
  ],
});

onMounted(async () => {
  const response = await authApi.me();
  data.value.user = {
    name: response.user.username,
    email: response.user.email,
    avatar: '',
    role: response.user.role,
  };

  if (data.value.user.role === 'super_admin') {
    const settingsItem = data.value.navMain.find(
      (item) => item.title === 'Settings'
    );
    settingsItem?.items?.push({
      title: 'Super',
      url: '/admin/super-settings',
    });
  }
});

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: 'icon',
});
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarContent>
      <NavMain :items="data.navMain" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="data.user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
