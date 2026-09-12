<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { breadcrumbState } from '@/composables/useBreadcrumb'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

type Crumb = { name: string; path?: string }

const route = useRoute()

const crumbs = computed<Crumb[]>(() => {
  const built: Crumb[] = []
  const matched = route.matched
  let acc = ''
  const segOf = (m: (typeof matched)[number]) => m.path || ''
  const nameOf = (m: (typeof matched)[number]) =>
    (m.meta?.title as string) || (m.name as string) || m.path || ''
  // 活动名由页面加载后写入 route.meta.activityName
  const actName = breadcrumbState.activityName
  const id = route.params.id as string

  for (let i = 0; i < matched.length; i++) {
    const m = matched[i]
    const seg = segOf(m)
    if (seg.startsWith('/')) {
      acc = seg
    } else if (seg) {
      acc = acc ? `${acc.replace(/\/$/, '')}/${seg.replace(/^\//, '')}` : `/${seg.replace(/^\//, '')}`
    }
    const name = nameOf(m)

    // ---- 活动模块：面包屑层级定制 ----
    switch (m.name) {
      case 'Activity List':
        // 列表页：Admin > Activities（替换 List，中间层已输出 Activities）
        break
      case 'Create':
        // 创建页：Admin > Activities > Create
        built.push({ name: 'Create' })
        break
      case 'Activity Detail':
        // 详情页：Admin > Activities > [活动名]（替换 Detail）
        built.push({ name: actName || 'Detail' })
        break
      case 'Edit Activity':
        // 编辑页：Admin > Activities > [活动名] > Edit
        built.push({
          name: actName || 'Edit',
          path: `/admin/activities/detail/${id}`,
        })
        built.push({ name: 'Edit' })
        break
      case 'Activity Prizes':
        // 奖品页：Admin > Activities > [活动名] > Prizes
        built.push({
          name: actName || 'Prizes',
          path: `/admin/activities/detail/${id}`,
        })
        built.push({ name: 'Prizes' })
        break
      case 'Activity Data':
        // 数据页：Admin > Activities > [活动名] > Data
        built.push({
          name: actName || 'Data',
          path: `/admin/activities/detail/${id}`,
        })
        built.push({ name: 'Data' })
        break
      default:
        // 其他路由：沿用原逻辑（Admin / Users 等）
        built.push({ name, path: acc || undefined })
    }
  }
  if (built.length) built[built.length - 1].path = undefined
  return built
})
</script>

<template>
  <Breadcrumb>
    <BreadcrumbList>
      <template v-for="(item, idx) in crumbs">
        <BreadcrumbItem v-if="idx < crumbs.length - 1" :key="`crumb-${idx}`">
          <BreadcrumbLink as-child>
            <RouterLink :to="item.path || '#'">{{ item.name }}</RouterLink>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator v-if="idx < crumbs.length - 1" :key="`sep-${idx}`" />
        <BreadcrumbItem v-if="idx === crumbs.length - 1" :key="`page-${idx}`">
          <BreadcrumbPage>{{ item.name }}</BreadcrumbPage>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
