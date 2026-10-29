import { describe, it, expect, beforeEach, vi } from 'vitest';

/** 伪造系统配色偏好：只对 (prefers-color-scheme: light) 返回 matches */
function mockSystemPrefersLight(prefersLight: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: light)' ? prefersLight : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Reset module state between tests
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  mockSystemPrefersLight(false);
  vi.resetModules();
});

describe('useTheme 初始主题', () => {
  it('没有存储值、系统无偏好 → 默认 dark', async () => {
    const { useTheme } = await import('./useTheme');
    expect(useTheme().theme.value).toBe('dark');
  });

  it('没有存储值、系统明确偏好浅色 → light', async () => {
    mockSystemPrefersLight(true);
    const { useTheme } = await import('./useTheme');
    expect(useTheme().theme.value).toBe('light');
  });

  it('存储了 dark：即使系统偏好浅色也用 dark', async () => {
    localStorage.setItem('theme-preference', 'dark');
    mockSystemPrefersLight(true);
    const { useTheme } = await import('./useTheme');
    expect(useTheme().theme.value).toBe('dark');
  });

  it('存储了 light：系统偏好深色也用 light', async () => {
    localStorage.setItem('theme-preference', 'light');
    const { useTheme } = await import('./useTheme');
    expect(useTheme().theme.value).toBe('light');
  });

  it('存储值非法时按没有选择处理', async () => {
    localStorage.setItem('theme-preference', 'sepia');
    const { useTheme } = await import('./useTheme');
    expect(useTheme().theme.value).toBe('dark');
  });

  it('模块加载时就把 data-theme 设到 <html>，不依赖调用 useTheme()', async () => {
    mockSystemPrefersLight(true);
    await import('./useTheme');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('只是读取初始值不会写 localStorage（否则等于替用户做了选择）', async () => {
    const { useTheme } = await import('./useTheme');
    useTheme();
    expect(localStorage.getItem('theme-preference')).toBeNull();
  });
});

describe('useTheme 切换与持久化', () => {
  it('toggleTheme 在 dark 与 light 之间切换', async () => {
    const { useTheme } = await import('./useTheme');
    const { theme, toggleTheme } = useTheme();

    expect(theme.value).toBe('dark');
    toggleTheme();
    expect(theme.value).toBe('light');
    toggleTheme();
    expect(theme.value).toBe('dark');
  });

  it('setTheme 持久化显式选择', async () => {
    const { useTheme } = await import('./useTheme');
    const { setTheme } = useTheme();

    setTheme('light');
    expect(localStorage.getItem('theme-preference')).toBe('light');
    setTheme('dark');
    expect(localStorage.getItem('theme-preference')).toBe('dark');
  });

  it('持久化后的选择在下次加载时优先于系统偏好', async () => {
    mockSystemPrefersLight(true);
    const first = await import('./useTheme');
    first.useTheme().setTheme('dark');

    vi.resetModules();
    const second = await import('./useTheme');
    expect(second.useTheme().theme.value).toBe('dark');
  });

  it('切换时同步更新 <html data-theme>', async () => {
    const { useTheme } = await import('./useTheme');
    const { setTheme } = useTheme();

    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('localStorage 写入失败时不抛错，本次会话内仍生效', async () => {
    const { useTheme } = await import('./useTheme');
    const { theme, setTheme } = useTheme();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => setTheme('light')).not.toThrow();
    expect(theme.value).toBe('light');
    spy.mockRestore();
  });

  it('暴露 isDark', async () => {
    const { useTheme } = await import('./useTheme');
    const { isDark, toggleTheme } = useTheme();

    expect(isDark.value).toBe(true);
    toggleTheme();
    expect(isDark.value).toBe(false);
  });
});
