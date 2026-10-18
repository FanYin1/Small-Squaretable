import { describe, it, expect, beforeEach, vi } from 'vitest';

const STORAGE_KEY = 'chat-font-size';
const ATTR = 'data-chat-font-size';

// 模块级单例：每个用例重置模块，才能重新读取 localStorage
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(ATTR);
  vi.resetModules();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('useChatFontSize', () => {
  it('没有存储偏好时默认为 medium', async () => {
    const { useChatFontSize } = await import('./useChatFontSize');
    const { size } = useChatFontSize();
    expect(size.value).toBe('medium');
  });

  it('读取 localStorage 中的有效偏好', async () => {
    localStorage.setItem(STORAGE_KEY, 'large');
    const { useChatFontSize } = await import('./useChatFontSize');
    const { size } = useChatFontSize();
    expect(size.value).toBe('large');
  });

  it('存储值非法时回退到 medium，而不是原样透传', async () => {
    localStorage.setItem(STORAGE_KEY, 'huge');
    const { useChatFontSize } = await import('./useChatFontSize');
    const { size } = useChatFontSize();
    expect(size.value).toBe('medium');
  });

  it('setSize 更新状态并持久化', async () => {
    const { useChatFontSize } = await import('./useChatFontSize');
    const { size, setSize } = useChatFontSize();

    setSize('small');
    await tick();
    expect(size.value).toBe('small');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('small');

    setSize('large');
    await tick();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('large');
  });

  it('setSize 拒绝非法档位', async () => {
    const { useChatFontSize } = await import('./useChatFontSize');
    const { size, setSize } = useChatFontSize();

    setSize('huge' as never);
    await tick();
    expect(size.value).toBe('medium');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('medium');
  });

  it('导入模块即把偏好写到 documentElement，不依赖组件挂载', async () => {
    localStorage.setItem(STORAGE_KEY, 'large');
    await import('./useChatFontSize');
    await tick();
    expect(document.documentElement.getAttribute(ATTR)).toBe('large');
  });

  it('切换档位时同步更新 documentElement 属性', async () => {
    const { useChatFontSize } = await import('./useChatFontSize');
    const { setSize } = useChatFontSize();

    setSize('small');
    await tick();
    expect(document.documentElement.getAttribute(ATTR)).toBe('small');

    setSize('medium');
    await tick();
    expect(document.documentElement.getAttribute(ATTR)).toBe('medium');
  });

  it('多次调用共享同一份状态', async () => {
    const { useChatFontSize } = await import('./useChatFontSize');
    const a = useChatFontSize();
    const b = useChatFontSize();

    a.setSize('large');
    expect(b.size.value).toBe('large');
  });

  it('localStorage 不可用时不抛错，仍可在内存中切换', async () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      const { useChatFontSize } = await import('./useChatFontSize');
      const { size, setSize } = useChatFontSize();
      expect(size.value).toBe('medium');
      setSize('large');
      await tick();
      expect(size.value).toBe('large');
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });

  it('暴露可选档位列表，顺序为 small < medium < large', async () => {
    const { CHAT_FONT_SIZES } = await import('./useChatFontSize');
    expect(CHAT_FONT_SIZES).toEqual(['small', 'medium', 'large']);
  });
});
