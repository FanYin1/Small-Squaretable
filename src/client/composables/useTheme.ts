import { computed } from 'vue';
import { useUiStore } from '@client/stores';

export function useTheme() {
  const uiStore = useUiStore();

  const theme = computed(() => uiStore.theme);
  const isDark = computed(() => uiStore.theme === 'dark');

  function setTheme(newTheme: 'light' | 'dark') {
    uiStore.setTheme(newTheme);
  }

  function toggleTheme() {
    uiStore.toggleTheme();
  }

  // 初始化主题
  function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    } else {
      // 检测系统主题
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
    initTheme,
  };
}
