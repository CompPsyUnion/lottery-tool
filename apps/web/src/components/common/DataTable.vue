<script setup lang="ts">
import { computed, h } from 'vue';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataTableProps, DataTableEmits, TableColumn } from './types';

const props = withDefaults(defineProps<DataTableProps>(), {
  loading: false,
  emptyText: '暂无数据',
  showPagination: true,
});

const emits = defineEmits<DataTableEmits>();

// 计算总页数
const totalPages = computed(() => {
  if (!props.pagination) return 0;
  return Math.ceil(props.pagination.total / props.pagination.pageSize);
});

// 处理页码变化
const handlePageChange = (page: number) => {
  emits('page-change', page);
};

// 获取单元格对齐样式
const getCellAlignClass = (align?: string) => {
  switch (align) {
  case 'center':
    return 'text-center';
  case 'right':
    return 'text-right';
  default:
    return 'text-left';
  }
};

// 渲染单元格内容
const renderCellContent = (column: TableColumn, record: Record<string, unknown>, index: number) => {
  if (column.render) {
    const result = column.render(record[column.key], record, index);
    // 如果返回的是字符串且包含HTML，创建一个div元素
    if (typeof result === 'string' && result.includes('<')) {
      return h('div', { innerHTML: result });
    }
    return result;
  }
  return record[column.key];
};
</script>

<template>
  <div class="data-table-container">
    <!-- 表格主体 -->
    <div class="rounded-md border">
      <Table>
        <!-- 表头 -->
        <TableHeader>
          <TableRow>
            <TableHead
              v-for="column in columns"
              :key="column.key"
              :class="[
                getCellAlignClass(column.align),
                column.width ? `w-[${column.width}]` : ''
              ]"
            >
              {{ column.title }}
            </TableHead>
          </TableRow>
        </TableHeader>

        <!-- 表格内容 -->
        <TableBody>
          <!-- 加载状态 -->
          <template v-if="loading">
            <TableRow v-for="i in 5" :key="`loading-${i}`">
              <TableCell
                v-for="column in columns"
                :key="`loading-${i}-${column.key}`"
                :class="getCellAlignClass(column.align)"
              >
                <Skeleton class="h-4 w-full" />
              </TableCell>
            </TableRow>
          </template>

          <!-- 空数据状态 -->
          <template v-else-if="!data || data.length === 0">
            <TableEmpty :colspan="columns.length">
              <div class="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <svg
                  class="w-12 h-12 mb-4 text-muted-foreground/50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p class="text-sm">{{ emptyText }}</p>
              </div>
            </TableEmpty>
          </template>

          <!-- 数据行 -->
          <template v-else>
            <TableRow
              v-for="(record, index) in data"
              :key="`row-${index}`"
              class="hover:bg-muted/50"
            >
              <TableCell
                v-for="column in columns"
                :key="`cell-${index}-${column.key}`"
                :class="getCellAlignClass(column.align)"
              >
                <component
                  :is="renderCellContent(column, record, index)"
                  v-if="column.render && typeof renderCellContent(column, record, index) !== 'string'"
                />
                <span v-else>
                  {{ typeof renderCellContent(column, record, index) === 'string' ? renderCellContent(column, record, index) : record[column.key] }}
                </span>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- 分页组件 -->
    <div
      v-if="showPagination && pagination && totalPages > 1"
      class="flex items-center justify-center py-4"
    >
      <Pagination
        v-slot="{ page }"
        :total="pagination.total"
        :items-per-page="pagination.pageSize"
        :default-page="pagination.current"
        @update:page="handlePageChange"
      >
        <PaginationContent v-slot="{ items }">
          <PaginationFirst />
          <PaginationPrevious />

          <template v-for="(item, index) in items">
            <PaginationEllipsis
              v-if="item.type === 'ellipsis'"
              :key="`ellipsis-${index}`"
              :index="index"
            />
            <PaginationItem
              v-else
              :key="`item-${item.value}`"
              :value="item.value"
              :is-active="item.value === page"
            >
              {{ item.value }}
            </PaginationItem>
          </template>

          <PaginationNext />
          <PaginationLast />
        </PaginationContent>
      </Pagination>
    </div>

    <!-- 分页信息显示 -->
    <div
      v-if="showPagination && pagination"
      class="flex items-center justify-between text-sm text-muted-foreground px-2"
    >
      <div>
        共 {{ pagination.total }} 条记录
      </div>
      <div v-if="totalPages > 1">
        第 {{ pagination.current }} 页，共 {{ totalPages }} 页
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-table-container > * + * {
  margin-top: 1rem;
}
</style>