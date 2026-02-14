import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module state between tests
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.resetModules();
});

describe('useTheme', () => {
  it('should default to light when no preference stored', async () => {
    const { useTheme } = await import('./useTheme');
    const { theme } = useTheme();
    expect(theme.value).toBe('light');
  });

  it('should read stored preference from localStorage', async () => {
    localStorage.setItem('theme-preference', 'dark');
    const { useTheme } = await import('./useTheme');
    const { theme } = useTheme();
    expect(theme.value).toBe('dark');
  });

  it('should toggle between light and dark', async () => {
    const { useTheme } = await import('./useTheme');
    const { theme, toggleTheme } = useTheme();

    expect(theme.value).toBe('light');
    toggleTheme();
    expect(theme.value).toBe('dark');
    toggleTheme();
    expect(theme.value).toBe('light');
  });

  it('should persist preference to localStorage on change', async () => {
    const { useTheme } = await import('./useTheme');
    const { setTheme } = useTheme();

    setTheme('dark');
    // watchEffect runs synchronously on first call, but we need a tick for subsequent
    await new Promise((r) => setTimeout(r, 0));
    expect(localStorage.getItem('theme-preference')).toBe('dark');

    setTheme('light');
    await new Promise((r) => setTimeout(r, 0));
    expect(localStorage.getItem('theme-preference')).toBe('light');
  });

  it('should set data-theme attribute on document.documentElement', async () => {
    const { useTheme } = await import('./useTheme');
    const { setTheme } = useTheme();

    setTheme('dark');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    setTheme('light');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('should expose isDark computed', async () => {
    const { useTheme } = await import('./useTheme');
    const { isDark, toggleTheme } = useTheme();

    expect(isDark.value).toBe(false);
    toggleTheme();
    expect(isDark.value).toBe(true);
  });
});
