import { reactive } from 'vue'

// 全局面包屑状态：当前活动页加载后写入活动名，Breadcrumbs 据此渲染 [活动名] 层级
// （与路由解耦，跨组件树响应式）
export const breadcrumbState = reactive<{ activityName: string }>({
  activityName: '',
})

export function setActivityName(name: string) {
  breadcrumbState.activityName = name || ''
}
