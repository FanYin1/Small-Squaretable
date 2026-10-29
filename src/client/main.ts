import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import { initWebVitals, observeCustomMetrics } from './utils/webVitals';
import { initSentry } from './utils/sentry';
import i18n from './i18n';

// 导入全局样式
// fonts.css 放最前：@font-face 先注册，后面的规则引用字体族时才不会有一帧回退。
import './styles/fonts.css';
import './styles/variables.css';
import './styles/global.css';
import './styles/transitions.css';
import './styles/story-shell.css';

const app = createApp(App);
const pinia = createPinia();

// Initialize Sentry first (before other setup)
initSentry(app, router);

// Register Pinia
app.use(pinia);

// Register Element Plus
app.use(ElementPlus);

// Register i18n
app.use(i18n);

// Register Element Plus Icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

// Register Router
app.use(router);

// Initialize Web Vitals monitoring
initWebVitals();
observeCustomMetrics();

app.mount('#app');
