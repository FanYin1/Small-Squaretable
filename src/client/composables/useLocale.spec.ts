import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { useLocale } from './useLocale';

function createWrapper(initialLocale: string = 'en-US') {
  const i18n = createI18n({
    legacy: false,
    locale: initialLocale,
    messages: { 'en-US': {}, 'zh-CN': {} },
  });

  let result: ReturnType<typeof useLocale>;
  const Comp = defineComponent({
    setup() {
      result = useLocale();
      return () => h('div');
    },
  });

  mount(Comp, { global: { plugins: [i18n] } });
  return result!;
}

describe('useLocale', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('currentLocale reflects the i18n locale (default en-US)', () => {
    const { currentLocale } = createWrapper('en-US');
    expect(currentLocale.value).toBe('en-US');
  });

  it('setLocale changes locale and persists to localStorage', () => {
    const { currentLocale, setLocale } = createWrapper('en-US');
    setLocale('zh-CN');
    expect(currentLocale.value).toBe('zh-CN');
    expect(localStorage.getItem('locale')).toBe('zh-CN');
  });

  it('toggleLocale switches from en-US to zh-CN', () => {
    const { currentLocale, toggleLocale } = createWrapper('en-US');
    toggleLocale();
    expect(currentLocale.value).toBe('zh-CN');
    expect(localStorage.getItem('locale')).toBe('zh-CN');
  });

  it('toggleLocale switches from zh-CN to en-US', () => {
    const { currentLocale, toggleLocale } = createWrapper('zh-CN');
    toggleLocale();
    expect(currentLocale.value).toBe('en-US');
    expect(localStorage.getItem('locale')).toBe('en-US');
  });
});
