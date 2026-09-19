<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Component } from 'vue'
import { useRouter } from 'vue-router'
import type { SidebarProps } from '../ui/sidebar'
import NavMain from '@/components/admin/NavMain.vue'
import NavUser from '@/components/admin/NavUser.vue'
import { Bot, Sparkles, Settings2, Users, ScrollText } from 'lucide-vue-next'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '../ui/sidebar'
import { authApi } from '@/api'

const router = useRouter()

// 用户信息类型
interface User {
  name: string
  email: string
  avatar: string
  role: string
}

// 导航栏项类型
interface NavMainItem {
  title: string
  url: string
  icon?: Component
  items?: Array<{
    title: string
    url: string
  }>
}

// 初始化侧边栏数据
const data = ref<{
  user: User
  navMain: Array<NavMainItem>
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
      title: 'Audit',
      url: '/admin/audit',
      icon: ScrollText,
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
})

onMounted(async () => {
  const response = await authApi.me()
  data.value.user = {
    name: response.user.username,
    email: response.user.email,
    avatar: '',
    role: response.user.role,
  }

  if (data.value.user.role === 'super_admin') {
    const settingsItem = data.value.navMain.find((item) => item.title === 'Settings')
    settingsItem?.items?.push({
      title: 'Super',
      url: '/admin/super-settings',
    })
  } else {
    // 创建/编辑他人用户仅超管（后端硬校验，侧边栏同步隐藏入口）
    const usersItem = data.value.navMain.find((item) => item.title === 'Users')
    if (usersItem?.items) {
      usersItem.items = usersItem.items.filter((sub) => sub.url !== '/admin/users/add')
    }
  }
})

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: 'icon',
})
</script>

<template>
  <Sidebar v-bind="props">
    <!-- 品牌位：点击回到主页（折叠态自动只剩图标） -->
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" @click="router.push('/')">
            <img
              src="/favicon.jpeg"
              alt="Lottery Tool"
              class="aspect-square size-8 rounded-lg object-cover"
            />
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-semibold">Lottery Tool</span>
              <span class="truncate text-xs text-muted-foreground">抽奖系统</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="data.navMain" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="data.user" />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
