import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';

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

app.mount('#app');
