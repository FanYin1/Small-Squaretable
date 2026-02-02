import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import { useUserStore } from './stores/user';

// 导入全局样式
import './styles/variables.css';
import './styles/global.css';
import './styles/transitions.css';

const app = createApp(App);
const pinia = createPinia();

// Register Pinia
app.use(pinia);

// Register Element Plus
app.use(ElementPlus);

// Register Element Plus Icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

// Register Router
app.use(router);

// 初始化用户认证状态（从 localStorage 恢复）
const userStore = useUserStore();
userStore.initialize().then(() => {
  console.log('User authentication initialized');
}).catch((error) => {
  console.error('Failed to initialize user authentication:', error);
});

app.mount('#app');
