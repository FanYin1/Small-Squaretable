import { ref, watchEffect, computed } from 'vue';

const STORAGE_KEY = 'theme-preference';

const theme = ref<'light' | 'dark'>(
  (localStorage.getItem(STORAGE_KEY) as 'light' | 'dark') || 'light'
);

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark');

  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.value);
    localStorage.setItem(STORAGE_KEY, theme.value);
  });

  function setTheme(newTheme: 'light' | 'dark') {
    theme.value = newTheme;
  }

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light';
  }

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  };
}
