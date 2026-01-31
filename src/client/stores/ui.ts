import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

function getInitialTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useUiStore = defineStore('ui', () => {
  // State
  const sidebarCollapsed = ref(false);
  const theme = ref<'light' | 'dark'>(getInitialTheme());
  const loading = ref(false);
  const loadingText = ref('');

  // Watch theme changes
  watch(theme, (newTheme) => {
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);
  }, { immediate: true });

  // Actions
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function setSidebarCollapsed(collapsed: boolean): void {
    sidebarCollapsed.value = collapsed;
  }

  function setTheme(newTheme: 'light' | 'dark'): void {
    theme.value = newTheme;
  }

  function toggleTheme(): void {
    theme.value = theme.value === 'light' ? 'dark' : 'light';
  }

  function startLoading(text = ''): void {
    loading.value = true;
    loadingText.value = text;
  }

  function stopLoading(): void {
    loading.value = false;
    loadingText.value = '';
  }

  return {
    sidebarCollapsed,
    theme,
    loading,
    loadingText,
    toggleSidebar,
    setSidebarCollapsed,
    setTheme,
    toggleTheme,
    startLoading,
    stopLoading,
  };
});
