<template>
  <div class="home">
    <!-- Hero Section -->
    <section class="hero bg-linear-to-br from-blue-50 to-indigo-100 py-16 px-4">
      <div class="container mx-auto max-w-4xl text-center">
        <h1 class="text-4xl md:text-6xl font-bold text-gray-900 mb-6">智能抽奖工具</h1>
        <p class="text-xl md:text-2xl text-gray-600 mb-8">公平、透明、便捷的在线抽奖平台</p>

        <!-- 按钮区域 -->
        <div v-if="!showActivities" class="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" class="px-8 py-3 text-lg" @click="goToAdmin"> 进入使用 </Button>
          <Button variant="outline" size="lg" class="px-8 py-3 text-lg" @click="openActivityList">
            参与活动
          </Button>
        </div>

        <!-- 参与活动：列出当前进行中的活动（线上/线下），点击直接进入抽奖页 -->
        <div v-else class="max-w-3xl mx-auto">
          <div v-if="loadingActivities" class="text-gray-600 py-8">正在加载活动列表...</div>
          <div v-else-if="activitiesError" class="text-red-600 py-8">{{ activitiesError }}</div>
          <div v-else-if="openActivities.length === 0" class="text-gray-600 py-8">
            暂无进行中的活动，请稍后再来
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            <Card
              v-for="item in openActivities"
              :key="item.id"
              class="cursor-pointer bg-white/90 p-4 transition-shadow hover:shadow-lg"
              @click="enterActivity(item.id)"
            >
              <div class="mb-1 flex items-center gap-2">
                <Gift class="h-4 w-4 shrink-0 text-blue-600" />
                <span class="truncate font-semibold text-gray-900">{{ item.name }}</span>
                <span class="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                  {{ item.lottery_mode === 'online' ? '线上' : '线下' }}
                </span>
              </div>
              <p class="min-h-10 text-sm text-gray-600">
                {{ item.description || '暂无描述' }}
              </p>
              <p class="mt-2 text-xs text-gray-400">
                {{ formatRange(item.start_time, item.end_time) }}
              </p>
            </Card>
          </div>
          <Button variant="ghost" class="mt-4 text-sm" @click="showActivities = false">
            返回
          </Button>
        </div>
      </div>
    </section>

    <!-- 介绍部分 -->
    <section class="features py-16 px-4 bg-white">
      <div class="container mx-auto max-w-6xl">
        <h2 class="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-12">功能特色</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Card class="p-6 hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-gray-900"> 🎯 公平抽奖 </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-gray-600">
                采用先进的随机算法，确保每次抽奖结果的公平性和随机性，让每位参与者都有平等的机会。
              </p>
            </CardContent>
          </Card>

          <Card class="p-6 hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-gray-900"> 📱 移动友好 </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-gray-600">
                完美适配各种设备，无论是手机、平板还是电脑，都能提供流畅的使用体验。
              </p>
            </CardContent>
          </Card>

          <Card class="p-6 hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-gray-900"> ⚡ 快速便捷 </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-gray-600">
                简单易用的界面设计，几步操作即可完成抽奖设置，快速开始您的抽奖活动。
              </p>
            </CardContent>
          </Card>

          <Card class="p-6 hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-gray-900"> 🔒 数据安全 </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-gray-600">
                严格保护用户数据隐私，所有抽奖记录都经过加密处理，确保信息安全。
              </p>
            </CardContent>
          </Card>

          <Card class="p-6 hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-gray-900"> 📊 结果透明 </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-gray-600">
                提供详细的抽奖过程记录和结果展示，让每次抽奖都公开透明，可追溯。
              </p>
            </CardContent>
          </Card>

          <Card class="p-6 hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle class="text-xl font-semibold text-gray-900"> 🎨 自定义设置 </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-gray-600">支持多种抽奖模式和自定义设置，满足不同场景的抽奖需求。</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>

    <!-- 底部页面 -->
    <footer class="bg-gray-50 py-12 px-4">
      <div class="container mx-auto max-w-6xl">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <!-- 其他服务 -->
          <div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">不断同学</h3>
            <ul class="space-y-2">
              <li>
                <a href="#" class="text-gray-600 hover:text-blue-600 transition-colors">主页</a>
              </li>
              <li>
                <a href="#" class="text-gray-600 hover:text-blue-600 transition-colors">抽奖工具</a>
              </li>
              <li>
                <a href="#" class="text-gray-600 hover:text-blue-600 transition-colors">实验室</a>
              </li>
            </ul>
          </div>

          <!-- 友情链接 -->
          <div>
            <h3 class="text-lg font-semibold text-gray-900 mb-4">友情链接</h3>
            <ul class="space-y-2">
              <li>
                <a href="#" class="text-gray-600 hover:text-blue-600 transition-colors"
                  >合作伙伴A</a
                >
              </li>
              <li>
                <a href="#" class="text-gray-600 hover:text-blue-600 transition-colors"
                  >合作伙伴B</a
                >
              </li>
              <li>
                <a href="#" class="text-gray-600 hover:text-blue-600 transition-colors"
                  >合作伙伴C</a
                >
              </li>
              <li>
                <a href="#" class="text-gray-600 hover:text-blue-600 transition-colors"
                  >合作伙伴D</a
                >
              </li>
            </ul>
          </div>
        </div>

        <!-- ICP备案号 -->
        <div class="border-t border-gray-200 pt-8 text-center">
          <p class="text-gray-500 text-sm">
            © 2025 不断同学创意网络科技工作室. MIT Licence. |
            <a href="#" class="hover:text-blue-600 transition-colors"
              >ICP备案号：京ICP备XXXXXXXX号</a
            >
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Gift } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { lotteryApi } from '@/api'
import type { OpenActivitySummary } from '@/types/api'

// 路由实例
const router = useRouter()

// 参与活动：公开活动列表（进行中，线上/线下均含）
const showActivities = ref(false)
const openActivities = ref<OpenActivitySummary[]>([])
const loadingActivities = ref(false)
const activitiesError = ref('')

const openActivityList = async () => {
  showActivities.value = true
  loadingActivities.value = true
  activitiesError.value = ''
  try {
    const res = await lotteryApi.listOpenActivities()
    openActivities.value = res.activities
  } catch (err) {
    activitiesError.value = err instanceof Error ? err.message : '获取活动列表失败'
  } finally {
    loadingActivities.value = false
  }
}

// 点击活动卡片进入对应抽奖页
const enterActivity = (id: number) => {
  router.push({ path: '/lottery', query: { activityId: String(id) } })
}

// 活动时间范围展示（缺失侧不限制）
const formatRange = (start?: string | null, end?: string | null): string => {
  const fmt = (t?: string | null) =>
    t ? new Date(t).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) : null
  const s = fmt(start)
  const e = fmt(end)
  if (!s && !e) return '长期开放'
  if (!e) return `开始于 ${s}`
  if (!s) return `截止 ${e}`
  return `${s} ~ ${e}`
}

// 跳转到管理页面
const goToAdmin = () => {
  router.push('/admin')
}
</script>

<style scoped>
.hero {
  min-height: 0vh;
  display: flex;
  align-items: center;
}

@media (max-width: 768px) {
  .hero {
    min-height: 50vh;
  }
}
</style>
