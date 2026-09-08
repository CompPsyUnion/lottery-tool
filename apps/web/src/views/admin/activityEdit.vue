<template>
  <div class="space-y-6" :class="{ 'pb-20': !isAtBottom }">
    <PageTitle title="Create Activity" />

    <form class="space-y-6" @submit="onSubmit">
      <!-- 基本信息 -->
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">基本信息</h3>

        <FormField v-slot="{ field: componentField }" name="name">
          <FormItem>
            <FormLabel>活动名称</FormLabel>
            <FormControl>
              <Input type="text" placeholder="请输入活动名称" v-bind="componentField" />
            </FormControl>
            <FormMessage />
            <FormDescription> 活动名称将显示在抽奖页面上 </FormDescription>
          </FormItem>
        </FormField>

        <FormField v-slot="{ field: componentField }" name="description">
          <FormItem>
            <FormLabel>活动描述</FormLabel>
            <FormControl>
              <textarea
                class="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="请输入活动描述"
                v-bind="componentField"
              ></textarea>
            </FormControl>
            <FormDescription> 详细描述活动内容和规则 </FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ field: componentField }" name="lottery_mode">
          <FormItem>
            <FormLabel>抽奖模式 *</FormLabel>
            <FormControl>
              <RadioGroup
                v-bind="componentField"
                class="mt-2 flex flex-col space-y-1 md:flex-row md:space-y-0 md:space-x-6"
              >
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="offline" value="offline" />
                  <Label for="offline">线下抽奖</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="online" value="online" />
                  <Label for="online">线上抽奖</Label>
                </div>
              </RadioGroup>
            </FormControl>
            <FormDescription>
              线上抽奖：用户自行输入抽奖码参与；线下抽奖：管理员操作抽奖
            </FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- 活动状态（仅编辑模式；创建恒为草稿。选项 = 当前状态 + 合法流转目标） -->
        <div v-if="isEditMode" class="grid gap-2">
          <Label>活动状态</Label>
          <Select v-model="selectedStatus">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="选择状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="s in statusOptions" :key="s" :value="s">
                {{ STATUS_LABELS[s] }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="text-xs text-muted-foreground">
            流转约束：草稿 → 已就绪（到开始时间自动进行）→ 进行中 →
            已结束（终态）；已就绪可撤回，保存时应用。
          </p>
        </div>
      </div>

      <!-- 时间设置 -->
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">时间设置</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField v-slot="{ field: componentField }" name="start_time">
            <FormItem>
              <FormLabel>开始时间</FormLabel>
              <FormControl>
                <Input type="datetime-local" v-bind="componentField" />
              </FormControl>
              <FormDescription> 活动开始时间 </FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ field: componentField }" name="end_time">
            <FormItem>
              <FormLabel>结束时间</FormLabel>
              <FormControl>
                <Input type="datetime-local" v-bind="componentField" />
              </FormControl>
              <FormDescription> 活动结束时间 </FormDescription>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
      </div>

      <!-- 抽奖设置 -->
      <div class="space-y-4">
        <h3 class="text-lg font-medium text-gray-900">抽奖设置</h3>

        <FormField v-slot="{ field: componentField }" name="settings.max_lottery_codes">
          <FormItem>
            <FormLabel>最大抽奖码数量</FormLabel>
            <FormControl>
              <Input
                type="number"
                placeholder="请输入最大抽奖码数量"
                min="1"
                v-bind="componentField"
              />
            </FormControl>
            <FormDescription> 限制活动可生成的抽奖码总数 </FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ field: componentField }" name="settings.lottery_code_format">
          <FormItem>
            <FormLabel>抽奖码格式</FormLabel>
            <FormControl>
              <RadioGroup
                v-bind="componentField"
                class="mt-2 flex flex-col space-y-1 md:flex-row md:flex-wrap md:space-y-0 md:gap-x-6 md:gap-y-2"
              >
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="4_digit_number" value="4_digit_number" />
                  <Label for="4_digit_number">4位数字</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="8_digit_number" value="8_digit_number" />
                  <Label for="8_digit_number">8位数字</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="8_digit_alphanumeric" value="8_digit_alphanumeric" />
                  <Label for="8_digit_alphanumeric">8位字母数字</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="12_digit_number" value="12_digit_number" />
                  <Label for="12_digit_number">12位数字</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="12_digit_alphanumeric" value="12_digit_alphanumeric" />
                  <Label for="12_digit_alphanumeric">12位字母数字</Label>
                </div>
              </RadioGroup>
            </FormControl>
            <FormDescription> 选择抽奖码的生成格式 </FormDescription>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- 签字设置（仅线下抽奖） -->
        <div v-if="form.values.lottery_mode === 'offline'" class="pt-4 border-t">
          <FormField v-slot="{ field: componentField }" name="settings.require_signature">
            <FormItem class="flex flex-row items-center justify-between rounded-lg border p-4">
              <div class="space-y-0.5">
                <FormLabel class="text-base">开启签字确认</FormLabel>
                <FormDescription>
                  线下抽奖完成后，弹出签字板要求参与者签字确认，签字图片直接保存在数据库中。
                </FormDescription>
              </div>
              <FormControl>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="(componentField as any).value"
                  :class="[
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    (componentField as any).value ? 'bg-blue-600' : 'bg-gray-200',
                  ]"
                  @click="
                    form.setFieldValue('settings.require_signature', !(componentField as any).value)
                  "
                >
                  <span
                    :class="[
                      'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
                      (componentField as any).value ? 'translate-x-5' : 'translate-x-0',
                    ]"
                  />
                </button>
              </FormControl>
            </FormItem>
          </FormField>
        </div>
      </div>

      <!-- 提交按钮 -->
      <div
        :class="[
          'flex space-x-4 transition-all duration-300',
          isAtBottom
            ? 'justify-start py-3 border-t static'
            : 'justify-start fixed bottom-0 z-10 -mx-4 px-4 py-3 w-full bg-white/80 backdrop-blur-lg border-t',
        ]"
      >
        <Button type="button" variant="outline" @click="$router.go(-1)"> 取消 </Button>
        <Button type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? '保存中...' : isEditMode ? '更新活动' : '创建活动' }}
        </Button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import * as z from 'zod'
import { toast } from 'vue-sonner'
import { useScroll } from '@vueuse/core'

import PageTitle from '@/components/ui/text/pageTitle.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { adminActivityApi } from '@/api'
import type { ActivityStatus, CreateActivityRequest, UpdateActivityRequest } from '@/types/api'

const route = useRoute()
const router = useRouter()

// 判断是否为编辑模式
const isEditMode = computed(() => !!route.params.id)
const activityId = computed(() => (route.params.id ? Number(route.params.id) : null))

// 表单验证规则
const formSchema = toTypedSchema(
  z
    .object({
      name: z.string().min(1, '活动名称不能为空').max(100, '活动名称不能超过100个字符'),
      description: z.string().max(1000, '活动描述不能超过1000个字符').optional(),
      lottery_mode: z.enum(['offline', 'online'], {
        message: '请选择抽奖模式',
      }),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      settings: z
        .object({
          max_lottery_codes: z.number().min(1, '最大抽奖码数量必须大于0').optional(),
          lottery_code_format: z
            .enum([
              '4_digit_number',
              '8_digit_number',
              '8_digit_alphanumeric',
              '12_digit_number',
              '12_digit_alphanumeric',
            ])
            .optional(),
          require_signature: z.boolean().optional(),
        })
        .optional(),
    })
    .refine(
      (data) => {
        if (data.start_time && data.end_time) {
          return new Date(data.start_time) < new Date(data.end_time)
        }
        return true
      },
      {
        message: '结束时间必须晚于开始时间',
        path: ['end_time'],
      },
    ),
)

// 表单实例
const form = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: '',
    description: '',
    lottery_mode: 'offline',
    start_time: '',
    end_time: '',
    settings: {
      max_lottery_codes: undefined,
      lottery_code_format: '4_digit_number',
      require_signature: false,
    },
  },
})

// 提交状态
const isSubmitting = ref(false)

// 滚动监听
const { y } = useScroll(window)
const isAtBottom = computed(() => {
  const scrollHeight = document.documentElement.scrollHeight
  const clientHeight = document.documentElement.clientHeight
  const scrollTop = y.value
  return scrollTop + clientHeight >= scrollHeight - 10 // 10px容差
})

// 加载活动数据（编辑模式）
const loadActivity = async () => {
  if (!isEditMode.value || !activityId.value) return

  try {
    const { activity } = await adminActivityApi.getActivity(activityId.value)

    // 格式化时间为 datetime-local 格式（按浏览器本地时区；
    // 原用 toISOString 是 UTC，非 UTC 时区用户回显偏移数小时）
    const formatDateTime = (dateStr?: string) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      const pad = (n: number) => String(n).padStart(2, '0')
      return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}`
      )
    }

    form.setValues({
      name: activity.name,
      description: activity.description || '',
      lottery_mode: activity.lottery_mode,
      start_time: formatDateTime(activity.start_time),
      end_time: formatDateTime(activity.end_time),
      settings: {
        max_lottery_codes: activity.settings?.max_lottery_codes,
        lottery_code_format: activity.settings?.lottery_code_format || '4_digit_number',
        require_signature: activity.settings?.require_signature || false,
      },
    })
    selectedStatus.value = activity.status
    originalStatus.value = activity.status
  } catch (error) {
    console.error('加载活动数据失败:', error)
    toast.error('加载活动数据失败')
  }
}

// ---- 活动状态切换（仅编辑模式；走专用端点，受流转矩阵约束） ----
const STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: '草稿（未就绪）',
  ready: '已就绪（到点自动开始）',
  active: '进行中',
  ended: '已结束（终态）',
}
// 与后端 ALLOWED_TRANSITIONS 镜像
const STATUS_TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  draft: ['ready'],
  ready: ['draft', 'active'],
  active: ['ended'],
  ended: [],
}

const selectedStatus = ref<ActivityStatus>('draft')
const originalStatus = ref<ActivityStatus>('draft')
const statusOptions = computed(() => [
  originalStatus.value,
  ...STATUS_TRANSITIONS[originalStatus.value],
])

// 表单提交
const onSubmit = form.handleSubmit(async (values) => {
  isSubmitting.value = true

  try {
    // 处理表单数据
    const formData: CreateActivityRequest | UpdateActivityRequest = {
      name: values.name,
      description: values.description || undefined,
      lottery_mode: values.lottery_mode as 'offline' | 'online',
      start_time: values.start_time || undefined,
      end_time: values.end_time || undefined,
      settings: {
        max_lottery_codes: values.settings?.max_lottery_codes || undefined,
        lottery_code_format: values.settings?.lottery_code_format || undefined,
        require_signature: values.settings?.require_signature || false,
      },
    }

    // 清理空的 settings（仅当所有值都是 undefined 时才删除）
    if (formData.settings && Object.values(formData.settings).every((v) => v === undefined)) {
      delete formData.settings
    }

    if (isEditMode.value && activityId.value) {
      // 更新活动
      await adminActivityApi.updateActivity(activityId.value, formData as UpdateActivityRequest)
      // 状态变化走专用端点（基本信息更新之后）
      if (selectedStatus.value !== originalStatus.value) {
        await adminActivityApi.updateActivityStatus(activityId.value, selectedStatus.value)
      }
      toast.success('活动更新成功')
    } else {
      // 创建活动
      await adminActivityApi.createActivity(formData as CreateActivityRequest)
      toast.success('活动创建成功')
    }

    // 返回活动列表
    router.push('/admin/activities')
  } catch (error) {
    console.error('保存活动失败:', error)
    toast.error(isEditMode.value ? '更新活动失败' : '创建活动失败')
  } finally {
    isSubmitting.value = false
  }
})

// 组件挂载时加载数据
onMounted(() => {
  loadActivity()
})
</script>
