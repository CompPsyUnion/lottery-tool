import type { Component } from 'vue';

/**
 * 表格列配置接口
 */
export interface TableColumn {
  /** 列的唯一标识，对应数据字段名 */
  key: string
  /** 列标题 */
  title: string
  /** 列宽度，支持CSS宽度值 */
  width?: string
  /** 文本对齐方式 */
  align?: 'left' | 'center' | 'right'
  /** 自定义渲染函数 */
  render?: (value: unknown, record: Record<string, unknown>, index: number) => string | Component
  /** 是否可排序 */
  sortable?: boolean
  /** 列是否固定 */
  fixed?: 'left' | 'right'
  /** 列的最小宽度 */
  minWidth?: string
  /** 列的最大宽度 */
  maxWidth?: string
}

/**
 * 分页信息接口
 */
export interface PaginationInfo {
  /** 当前页码 */
  current: number
  /** 每页显示条数 */
  pageSize: number
  /** 总记录数 */
  total: number
  /** 可选的每页显示条数选项 */
  pageSizeOptions?: number[]
  /** 是否显示快速跳转 */
  showQuickJumper?: boolean
  /** 是否显示总数 */
  showTotal?: boolean
}

/**
 * 表格排序信息接口
 */
export interface SortInfo {
  /** 排序字段 */
  field: string
  /** 排序方向 */
  order: 'asc' | 'desc'
}

/**
 * 表格筛选信息接口
 */
export interface FilterInfo {
  /** 筛选字段 */
  field: string
  /** 筛选值 */
  value: unknown
  /** 筛选操作符 */
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in'
}

/**
 * DataTable 组件 Props 接口
 */
export interface DataTableProps {
  /** 表格列配置 */
  columns: TableColumn[]
  /** 表格数据 */
  data: Record<string, unknown>[]
  /** 是否显示加载状态 */
  loading?: boolean
  /** 分页配置 */
  pagination?: PaginationInfo
  /** 空数据提示文本 */
  emptyText?: string
  /** 是否显示分页组件 */
  showPagination?: boolean
  /** 表格大小 */
  size?: 'small' | 'medium' | 'large'
  /** 是否显示边框 */
  bordered?: boolean
  /** 是否显示斑马纹 */
  striped?: boolean
  /** 行选择配置 */
  rowSelection?: RowSelectionConfig
  /** 表格高度，设置后会出现滚动条 */
  height?: string | number
  /** 表格最大高度 */
  maxHeight?: string | number
}

/**
 * 行选择配置接口
 */
export interface RowSelectionConfig {
  /** 选择类型 */
  type?: 'checkbox' | 'radio'
  /** 已选择的行键值 */
  selectedRowKeys?: (string | number)[]
  /** 选择变化回调 */
  onChange?: (selectedRowKeys: (string | number)[], selectedRows: Record<string, unknown>[]) => void
  /** 全选/取消全选回调 */
  onSelectAll?: (selected: boolean, selectedRows: Record<string, unknown>[], changeRows: Record<string, unknown>[]) => void
  /** 选择/取消选择某行回调 */
  onSelect?: (record: Record<string, unknown>, selected: boolean, selectedRows: Record<string, unknown>[], nativeEvent: Event) => void
  /** 获取行的唯一标识 */
  getRowKey?: (record: Record<string, unknown>) => string | number
}

/**
 * DataTable 组件 Emits 接口
 */
export interface DataTableEmits {
  /** 页码变化事件 */
  (e: 'page-change', page: number): void
  /** 每页条数变化事件 */
  (e: 'page-size-change', pageSize: number): void
  /** 排序变化事件 */
  (e: 'sort-change', sortInfo: SortInfo | null): void
  /** 筛选变化事件 */
  (e: 'filter-change', filters: FilterInfo[]): void
  /** 行选择变化事件 */
  (e: 'selection-change', selectedRowKeys: (string | number)[], selectedRows: Record<string, unknown>[]): void
  /** 行点击事件 */
  (e: 'row-click', record: Record<string, unknown>, index: number, event: Event): void
  /** 行双击事件 */
  (e: 'row-dblclick', record: Record<string, unknown>, index: number, event: Event): void
}

/**
 * 表格操作按钮配置
 */
export interface TableAction {
  /** 按钮文本 */
  label: string
  /** 按钮类型 */
  type?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
  /** 按钮大小 */
  size?: 'small' | 'medium' | 'large'
  /** 是否禁用 */
  disabled?: boolean | ((record: Record<string, unknown>) => boolean)
  /** 是否显示 */
  visible?: boolean | ((record: Record<string, unknown>) => boolean)
  /** 点击事件 */
  onClick: (record: Record<string, unknown>, index: number) => void
  /** 图标 */
  icon?: Component
}

/**
 * 表格工具栏配置
 */
export interface TableToolbar {
  /** 标题 */
  title?: string
  /** 左侧操作按钮 */
  actions?: TableAction[]
  /** 右侧工具按钮 */
  tools?: TableAction[]
  /** 是否显示刷新按钮 */
  showRefresh?: boolean
  /** 是否显示列设置按钮 */
  showColumnSetting?: boolean
  /** 是否显示密度设置按钮 */
  showDensitySetting?: boolean
}