<script setup lang="ts">
import AppSidebar from '@/components/admin/AppSidebar.vue';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import Breadcrumbs from '@/components/navigation/Breadcrumbs.vue';
import { Separator } from '@/components/ui/separator';
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header
        class="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12"
      >
        <div class="flex items-center gap-2 px-4">
          <SidebarTrigger class="-ml-1" />
          <Separator orientation="vertical" class="mr-2 h-4" />
          <Breadcrumbs />
        </div>
      </header>
      <div class="px-4 py-2">
        <RouterView />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
