import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { Toaster } from 'vue-sonner'
import AppGuardedSave from './components/common/AppGuardedSave.vue'
// 包自带 savebar/离场弹窗动画样式（Tailwind 扫描覆盖不到 node_modules 内的 scoped 样式）
import 'vue-guarded-save/style.css'
import App from './App.vue'
import router from './router'
import './index.css'

const app = createApp(App)
const pinia = createPinia()

const setPageTitle = (title: string) => {
  document.title = `${title} - Lottery`
}

router.beforeEach((to, from, next) => {
  if (to.meta.title) {
    setPageTitle(to.meta.title as string)
  }
  next()
})

pinia.use(createPersistedState())
app.use(pinia)
app.use(router)
app.component('Toaster', Toaster)
// 管理端页面级表单统一保存条 + 未保存离开守卫（中文默认文案与快捷键在封装内集中设置）
app.component('GuardedSave', AppGuardedSave)
app.mount('#app')
