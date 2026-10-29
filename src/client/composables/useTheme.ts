import { ref, computed, watch } from 'vue';
import {
  THEME_STORAGE_KEY,
  readStoredTheme,
  resolveTheme,
  systemPrefersLight,
  type Theme,
} from '@client/utils/theme';

/**
 * 初始值与 index.html 的内联脚本走同一条规则（见 utils/theme.ts）：
 * 显式选择 > 系统明确偏好浅色 > 默认暗色。
 */
const theme = ref<Theme>(resolveTheme(readStoredTheme(), systemPrefersLight()));

function applyTheme(value: Theme) {
  document.documentElement.setAttribute('data-theme', value);
}

// 模块加载时就落到 <html>，不依赖某个组件先调用 useTheme()；
// 平时内联脚本已经设过，这里只是兜底（例如脚本被 CSP 拦截）
applyTheme(theme.value);
watch(theme, applyTheme, { flush: 'sync' });

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark');

  // 只有用户显式切换才写 localStorage。若把"按系统偏好解析出来的值"也写进去，
  // 就等于替用户做了选择，之后系统主题再变也不会跟随
  function setTheme(newTheme: Theme) {
    theme.value = newTheme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // 存储不可用时只在本次会话内生效
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'light' ? 'dark' : 'light');
  }

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  };
}
