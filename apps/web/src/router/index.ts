import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import adminRoutes from './admin'
import { useUserStore } from '../stores/user'

// 定义路由
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
    meta: {
      title: '首页',
    },
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('../views/About.vue'),
    meta: {
      title: '关于',
    },
  },
  {
    path: '/lottery',
    name: 'Lottery',
    component: () => import('../views/lottery.vue'),
    meta: {
      title: '抽奖',
    },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/auth/login.vue'),
    meta: {
      title: '登录',
    },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/auth/register.vue'),
    meta: {
      title: '注册',
    },
  },
  // 管理员路由
  ...adminRoutes,
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 全局路由守卫：受保护页面未登录一律回登录页（携带回跳地址）；
// 已登录用户访问登录/注册页直接进入管理面板。
router.beforeEach((to) => {
  const userStore = useUserStore()
  const isLoggedIn = Boolean(userStore.token)

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  if (requiresAuth && !isLoggedIn) {
    return {
      name: 'Login',
      query: { backurl: encodeURIComponent(to.fullPath) },
    }
  }

  if (isLoggedIn && (to.name === 'Login' || to.name === 'Register')) {
    return { name: 'Dashboard' }
  }

  return true
})

export default router
