<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

type Crumb = { name: string; path?: string };

const route = useRoute();

const crumbs = computed<Crumb[]>(() => {
  const built: Crumb[] = [];
  let acc = '';
  for (const m of route.matched) {
    const name =
      (m.meta?.title as string) || (m.name as string) || m.path || '';
    const seg = m.path || '';
    if (seg.startsWith('/')) {
      acc = seg;
    } else if (seg) {
      acc = acc
        ? `${acc.replace(/\/$/, '')}/${seg.replace(/^\//, '')}`
        : `/${seg.replace(/^\//, '')}`;
    }
    built.push({ name: String(name), path: acc || undefined });
  }
  if (built.length) built[built.length - 1].path = undefined;
  return built;
});
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
        <BreadcrumbSeparator
          v-if="idx < crumbs.length - 1"
          :key="`sep-${idx}`"
        />
        <BreadcrumbItem v-if="idx === crumbs.length - 1" :key="`page-${idx}`">
          <BreadcrumbPage>{{ item.name }}</BreadcrumbPage>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
