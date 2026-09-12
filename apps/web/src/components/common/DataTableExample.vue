<script setup lang="ts">
import { ref, reactive } from 'vue';
import DataTable from './DataTable.vue';
import { Button } from '@/components/ui/button';

// 示例数据
const loading = ref(false);
const tableData = ref([
  { id: 1, name: '张三', age: 25, email: 'zhangsan@example.com', status: '活跃' },
  { id: 2, name: '李四', age: 30, email: 'lisi@example.com', status: '禁用' },
  { id: 3, name: '王五', age: 28, email: 'wangwu@example.com', status: '活跃' },
  { id: 4, name: '赵六', age: 35, email: 'zhaoliu@example.com', status: '活跃' },
  { id: 5, name: '钱七', age: 22, email: 'qianqi@example.com', status: '禁用' },
]);

// 分页信息
const pagination = reactive({
  current: 1,
  pageSize: 3,
  total: 15, // 假设总共有15条数据
});

// 表格列配置
const columns = [
  {
    key: 'id',
    title: 'ID',
    width: '80px',
    align: 'center' as const,
  },
  {
    key: 'name',
    title: '姓名',
    width: '120px',
  },
  {
    key: 'age',
    title: '年龄',
    width: '80px',
    align: 'center' as const,
  },
  {
    key: 'email',
    title: '邮箱',
  },
  {
    key: 'status',
    title: '状态',
    width: '100px',
    align: 'center' as const,
    render: (value: unknown) => {
      const statusValue = String(value);
      const statusClass = statusValue === '活跃' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">${statusValue}</span>`;
    },
  },
  {
    key: 'actions',
    title: '操作',
    width: '120px',
    align: 'center' as const,
    render: () => {
      return `<div class="flex gap-2 justify-center">
        <button class="text-blue-600 hover:text-blue-800 text-sm">编辑</button>
        <button class="text-red-600 hover:text-red-800 text-sm">删除</button>
      </div>`;
    },
  },
];

// 处理页码变化
const handlePageChange = (page: number) => {
  pagination.current = page;
  // 这里可以调用API获取新页面的数据
  loadData();
};

// 模拟加载数据
const loadData = async () => {
  loading.value = true;
  // 模拟API调用延迟
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 根据当前页码生成模拟数据
  const start = (pagination.current - 1) * pagination.pageSize;
  const mockData = Array.from({ length: pagination.pageSize }, (_, index) => ({
    id: start + index + 1,
    name: `用户${start + index + 1}`,
    age: 20 + Math.floor(Math.random() * 20),
    email: `user${start + index + 1}@example.com`,
    status: Math.random() > 0.5 ? '活跃' : '禁用',
  }));
  
  tableData.value = mockData;
  loading.value = false;
};

// 切换加载状态
const toggleLoading = () => {
  loading.value = !loading.value;
};

// 清空数据
const clearData = () => {
  tableData.value = [];
};

// 重置数据
const resetData = () => {
  tableData.value = [
    { id: 1, name: '张三', age: 25, email: 'zhangsan@example.com', status: '活跃' },
    { id: 2, name: '李四', age: 30, email: 'lisi@example.com', status: '禁用' },
    { id: 3, name: '王五', age: 28, email: 'wangwu@example.com', status: '活跃' },
  ];
};
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="space-y-4">
      <h1 class="text-2xl font-bold">DataTable 组件示例</h1>
      
      <!-- 操作按钮 -->
      <div class="flex gap-2">
        <Button @click="toggleLoading" variant="outline">
          {{ loading ? '停止加载' : '开始加载' }}
        </Button>
        <Button @click="clearData" variant="outline">
          清空数据
        </Button>
        <Button @click="resetData" variant="outline">
          重置数据
        </Button>
        <Button @click="loadData" variant="outline">
          刷新数据
        </Button>
      </div>
    </div>

    <!-- 数据表格 -->
    <DataTable
      :columns="columns"
      :data="tableData"
      :loading="loading"
      :pagination="pagination"
      :show-pagination="true"
      empty-text="没有找到相关数据"
      @page-change="handlePageChange"
    />

    <!-- 使用说明 -->
    <div class="mt-8 p-4 bg-gray-50 rounded-lg">
      <h3 class="text-lg font-semibold mb-2">使用说明</h3>
      <ul class="space-y-1 text-sm text-gray-600">
        <li>• 支持自定义列配置，包括宽度、对齐方式和自定义渲染</li>
        <li>• 支持分页功能，通过 props 传入分页信息，通过 emits 回传页码变化</li>
        <li>• 支持加载状态，显示骨架屏效果</li>
        <li>• 支持空数据状态，显示友好的空状态提示</li>
        <li>• 基于 shadcn-vue 组件库构建，保证样式一致性</li>
      </ul>
    </div>
  </div>
</template>