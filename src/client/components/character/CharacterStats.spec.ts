import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, it, expect } from 'vitest';
import CharacterStats from './CharacterStats.vue';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

const mockCharacter = {
  viewCount: 500,
  downloadCount: 100,
  favoriteCount: 50,
  commentCount: 25,
  ratingAvg: '4.5',
  ratingCount: 30,
};

describe('CharacterStats', () => {
  it('renders all stat values', () => {
    const wrapper = mount(CharacterStats, {
      props: { character: mockCharacter },
      global: {
        plugins: [i18n],
        stubs: {
          ElIcon: { template: '<span class="el-icon"><slot /></span>' },
        },
      },
    });
    expect(wrapper.text()).toContain('500');
    expect(wrapper.text()).toContain('100');
    expect(wrapper.text()).toContain('50');
    expect(wrapper.text()).toContain('25');
  });

  it('shows rating with count', () => {
    const wrapper = mount(CharacterStats, {
      props: { character: mockCharacter },
      global: {
        plugins: [i18n],
        stubs: {
          ElIcon: { template: '<span class="el-icon"><slot /></span>' },
        },
      },
    });
    expect(wrapper.text()).toContain('4.5');
    expect(wrapper.text()).toContain('30');
  });
});
