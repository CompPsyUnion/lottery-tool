<template>
  <div class="space-y-6">
    <PageTitle :title="'用户管理'" />

    <!-- 搜索和筛选区域 -->
    <div class="flex flex-col sm:flex-row gap-4">
      <div class="flex-1">
        <Input
          v-model="searchParams.search"
          type="text"
          placeholder="搜索用户名或邮箱..."
          class="w-full"
          @input="handleSearch"
        />
      </div>
      <div class="flex gap-2">
        <Select v-model="searchParams.role" @update:model-value="handleSearch">
          <SelectTrigger class="w-35">
            <SelectValue placeholder="选择角色" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">管理员</SelectItem>
            <SelectItem value="super_admin">超级管理员</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="searchParams.status" @update:model-value="handleSearch">
          <SelectTrigger class="w-35">
            <SelectValue placeholder="选择状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">活跃</SelectItem>
            <SelectItem value="inactive">禁用</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- 用户列表表格 -->
    <DataTable
      :columns="columns"
      :data="users"
      :loading="loading"
      :pagination="paginationInfo"
      :empty-text="'暂无用户数据'"
      @page-change="handlePageChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { systemApi } from '@/api'
import type { User, UserListParams } from '@/types/api'
import type { TableColumn } from '@/components/common/types'
import PageTitle from '@/components/ui/text/pageTitle.vue'
import DataTable from '@/components/common/DataTable.vue'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// 路由实例
const router = useRouter()

// 响应式数据
const loading = ref(false)
const users = ref<User[]>([])
const searchParams = reactive<UserListParams>({
  page: 1,
  limit: 10,
  search: '',
  role: undefined,
  status: undefined,
})

// 分页信息
const paginationInfo = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

// 表格列配置
const columns: TableColumn[] = [
  {
    key: 'id',
    title: 'ID',
    width: '80px',
    align: 'center',
  },
  {
    key: 'username',
    title: '用户名',
    width: '150px',
  },
  {
    key: 'email',
    title: '邮箱',
    width: '200px',
  },
  {
    key: 'role',
    title: '角色',
    width: '120px',
    align: 'center',
    render: (value: unknown) => {
      const role = value as string
      const roleMap = {
        admin: { text: '管理员', class: 'bg-blue-100 text-blue-800' },
        super_admin: { text: '超级管理员', class: 'bg-purple-100 text-purple-800' },
      }
      const roleInfo = roleMap[role as keyof typeof roleMap] || {
        text: role,
        class: 'bg-gray-100 text-gray-800',
      }
      return h(
        'span',
        {
          class: `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${roleInfo.class}`,
        },
        roleInfo.text,
      )
    },
  },
  {
    key: 'status',
    title: '状态',
    width: '100px',
    align: 'center',
    render: (value: unknown) => {
      const status = value as string
      const statusMap = {
        active: { text: '活跃', class: 'bg-green-100 text-green-800' },
        inactive: { text: '禁用', class: 'bg-red-100 text-red-800' },
      }
      const statusInfo = statusMap[status as keyof typeof statusMap] || {
        text: status,
        class: 'bg-gray-100 text-gray-800',
      }
      return h(
        'span',
        {
          class: `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo.class}`,
        },
        statusInfo.text,
      )
    },
  },
  {
    key: 'created_at',
    title: '创建时间',
    width: '180px',
    render: (value: unknown) => {
      const date = new Date(value as string)
      return date.toLocaleString('zh-CN')
    },
  },
  {
    key: 'actions',
    title: '操作',
    width: '120px',
    render: (value: unknown, record: Record<string, unknown>) => {
      const user = record as unknown as User
      return `
        <div class="flex items-center gap-2">
          <button onclick="handleEditUser('${user.id}')" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8" title="编辑用户">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
          <button onclick="handleStatusChange('${user.id}', '${user.status}')" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 ${user.status === 'active' ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}" title="${user.status === 'active' ? '禁用用户' : '启用用户'}">
            ${
              user.status === 'active'
                ? '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"></path></svg>'
                : '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
            }
          </button>
        </div>
      `
    },
  },
]

// 获取用户列表
const fetchUsers = async () => {
  try {
    loading.value = true
    const response = await systemApi.getUsers(searchParams)
    users.value = response.users

    // 更新分页信息
    paginationInfo.current = response.pagination.page
    paginationInfo.pageSize = response.pagination.limit
    paginationInfo.total = response.pagination.total
  } catch {
    // console.error('获取用户列表失败:', error);
    users.value = []
  } finally {
    loading.value = false
  }
}

// 处理搜索
const handleSearch = () => {
  searchParams.page = 1
  paginationInfo.current = 1
  fetchUsers()
}

// 处理分页变化
const handlePageChange = (page: number) => {
  searchParams.page = page
  paginationInfo.current = page
  fetchUsers()
}

// 处理状态变更
const handleStatusChange = async (userId: string, currentStatus: string) => {
  try {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    await systemApi.updateUserStatus(Number(userId), newStatus)

    // 更新本地数据
    const userIndex = users.value.findIndex((u) => u.id === Number(userId))
    if (userIndex !== -1) {
      users.value[userIndex].status = newStatus
    }
  } catch (error) {
    console.error('更新用户状态失败:', error)
  }
}

// 处理编辑用户
const handleEditUser = (userId: string) => {
  // 跳转到用户编辑页面
  router.push(`/admin/users/detail/${userId}`)
}

// 将操作函数挂载到全局，供内联事件使用
;(window as unknown as Record<string, unknown>).handleEditUser = handleEditUser
;(window as unknown as Record<string, unknown>).handleStatusChange = handleStatusChange

// 组件挂载时获取数据
onMounted(() => {
  fetchUsers()
})
</script>
