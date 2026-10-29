import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import i18n from '../../i18n';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-chat-font-size');
  vi.resetModules();
});

// MarkdownRenderer 依赖 katex / highlight.js，对本组件的行为没有贡献，换成轻量替身
async function mountSetting() {
  const { default: ChatFontSizeSetting } = await import('./ChatFontSizeSetting.vue');
  return mount(ChatFontSizeSetting, {
    global: {
      plugins: [i18n],
      stubs: { MarkdownRenderer: { template: '<div class="md-stub" />', props: ['content'] } },
    },
  });
}

describe('ChatFontSizeSetting', () => {
  it('渲染三个单选项，默认选中 medium', async () => {
    const wrapper = await mountSetting();
    const radios = wrapper.findAll('[role="radio"]');

    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.attributes('data-size'))).toEqual(['small', 'medium', 'large']);
    expect(wrapper.find('[data-size="medium"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.find('[data-size="small"]').attributes('aria-checked')).toBe('false');
  });

  it('点击选项后更新偏好并写入 localStorage 与 <html> 属性', async () => {
    const wrapper = await mountSetting();

    await wrapper.find('[data-size="large"]').trigger('click');
    await new Promise((r) => setTimeout(r, 0));

    expect(wrapper.find('[data-size="large"]').attributes('aria-checked')).toBe('true');
    expect(localStorage.getItem('chat-font-size')).toBe('large');
    expect(document.documentElement.getAttribute('data-chat-font-size')).toBe('large');
  });

  it('只有选中项在 Tab 序列里（roving tabindex）', async () => {
    const wrapper = await mountSetting();

    expect(wrapper.find('[data-size="medium"]').attributes('tabindex')).toBe('0');
    expect(wrapper.find('[data-size="small"]').attributes('tabindex')).toBe('-1');
    expect(wrapper.find('[data-size="large"]').attributes('tabindex')).toBe('-1');
  });

  it('方向键在选项间循环切换', async () => {
    const wrapper = await mountSetting();

    await wrapper.find('[data-size="medium"]').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.find('[data-size="large"]').attributes('aria-checked')).toBe('true');

    await wrapper.find('[data-size="large"]').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.find('[data-size="small"]').attributes('aria-checked')).toBe('true');

    await wrapper.find('[data-size="small"]').trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.find('[data-size="large"]').attributes('aria-checked')).toBe('true');
  });

  it('读取已保存的偏好作为初始选中项', async () => {
    localStorage.setItem('chat-font-size', 'small');
    const wrapper = await mountSetting();

    expect(wrapper.find('[data-size="small"]').attributes('aria-checked')).toBe('true');
  });
});
