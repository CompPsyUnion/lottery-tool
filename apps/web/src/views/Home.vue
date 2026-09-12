<template>
  <div class="home">
    <!-- Hero Section -->
    <section class="hero bg-linear-to-br from-blue-50 to-indigo-100 py-16 px-4">
      <div class="container mx-auto max-w-4xl text-center">
        <h1 class="text-4xl md:text-6xl font-bold text-gray-900 mb-6">智能抽奖工具</h1>
        <p class="text-xl md:text-2xl text-gray-600 mb-8">公平、透明、便捷的在线抽奖平台</p>

        <!-- 按钮区域 -->
        <div v-if="!showParticipateForm" class="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" class="px-8 py-3 text-lg" @click="goToAdmin"> 进入使用 </Button>
          <Button
            variant="outline"
            size="lg"
            class="px-8 py-3 text-lg"
            @click="showParticipateForm = true"
          >
            参与活动
          </Button>
        </div>

        <!-- 参与活动表单 -->
        <div v-else class="max-w-md mx-auto">
          <div class="flex flex-col sm:flex-row gap-4">
            <Input
              v-model="activityId"
              placeholder="请输入主办方提供的活动id进入"
              class="flex-1 bg-white"
            />
            <Button @click="participateActivity"> 参与活动 </Button>
          </div>
          <Button variant="ghost" class="mt-2 text-sm" @click="showParticipateForm = false">
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// 路由实例
const router = useRouter()

// 响应式数据
const showParticipateForm = ref(false)
const activityId = ref('')

// 跳转到管理页面
const goToAdmin = () => {
  router.push('/admin')
}

// 参与活动
const participateActivity = () => {
  if (activityId.value.trim()) {
    router.push({
      path: '/lottery',
      query: { activityId: activityId.value.trim() },
    })
  }
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
