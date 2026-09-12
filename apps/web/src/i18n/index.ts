import { createI18n } from 'vue-i18n';
import zh from './locales/zh.json';

const messages = {
  'zh-CN': zh,
};

const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: 'en-US', // 默认语言为英文
  fallbackLocale: 'zh-CN', // 回退语言为中文
  messages,
});

export default i18n;