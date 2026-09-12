import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createPersistedState } from 'pinia-plugin-persistedstate';
import { Toaster } from 'vue-sonner';
import App from './App.vue';
import router from './router';
import './index.css';

const app = createApp(App);
const pinia = createPinia();

const setPageTitle = (title: string) => {
  document.title = `${title} - Lottery`;
};

router.beforeEach((to, from, next) => {
  if (to.meta.title) {
    setPageTitle(to.meta.title as string);
  }
  next();
});

pinia.use(createPersistedState());
app.use(pinia);
app.use(router);
app.component('Toaster', Toaster);
app.mount('#app');

