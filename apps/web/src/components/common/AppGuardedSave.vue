<script setup lang="ts">
/**
 * GuardedSave 全站封装：中文默认文案集中在此（页面不再各自维护 labels），
 * 透传其余 props；样式走包内 shadcn 语义 token（bg-primary 等）——
 * 由项目 index.css 的 @source 扫描生成、自动套用本站主题色。
 */
import { computed } from 'vue'
import { toast } from 'vue-sonner'
import { GuardedSave } from 'vue-guarded-save'

const props = defineProps<{
  dirty: boolean
  onSave: () => Promise<boolean | void> | boolean | void
  onDiscard: () => void
  /** 覆盖默认文案（仅传需覆盖的键） */
  labels?: Record<string, string>
  sidebarInset?: boolean
  insetClass?: string
  barClass?: string
  saveClass?: string
  discardClass?: string
  leaveGuard?: boolean
  unloadGuard?: boolean
  saveShortcut?: boolean
}>()

/**
 * 包的保存回调若 resolve undefined 会被当作成功闪 ✓（源码 `!== false` 判断），
 * 而 vee-validate handleSubmit 校验失败恰恰 resolve undefined——表现为"点了保存
 * 毫无反应/假闪成功"。这里统一拦截：undefined = 校验未过，明确提示且不闪 ✓。
 */
const guardedOnSave = async (): Promise<boolean> => {
  const result = await props.onSave()
  if (result === undefined) {
    toast.error('部分字段未通过校验，请检查表单项')
    return false
  }
  return result
}

const defaultLabels = {
  save: '保存',
  discard: '放弃更改',
  saved: '已保存',
  saving: '保存中…',
  dialogTitle: '有未保存的更改',
  dialogDescription: '离开将丢失未保存的更改。要先保存吗？',
  dialogSave: '保存并离开',
  dialogDiscard: '放弃更改',
  dialogCancel: '留在本页',
  unloadWarning: '有未保存的更改，确定离开？',
}

const mergedLabels = computed(() => ({ ...defaultLabels, ...(props.labels || {}) }))
</script>

<template>
  <GuardedSave
    :dirty="dirty"
    :on-save="guardedOnSave"
    :on-discard="onDiscard"
    :labels="mergedLabels"
    :sidebar-inset="sidebarInset ?? true"
    :inset-class="
      insetClass ??
      'md:left-64 group-has-[[data-collapsible=icon]]/sidebar-wrapper:md:left-[3.5rem]'
    "
    :bar-class="barClass"
    :save-class="saveClass"
    :discard-class="discardClass"
    :leave-guard="leaveGuard"
    :unload-guard="unloadGuard"
    :save-shortcut="saveShortcut ?? true"
  />
</template>
