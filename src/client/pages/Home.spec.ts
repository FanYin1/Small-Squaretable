/**
 * Home Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Home from './Home.vue';
import i18n from '../i18n';

// Mock vue-router
const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn() }),
  RouterLink: {
    template: '<a class="router-link"><slot /></a>',
    props: ['to'],
  },
}));

const elStubs = {
  'el-icon': { template: '<i><slot /></i>' },
  'router-link': { template: '<a class="router-link"><slot /></a>', props: ['to'] },
};

describe('Home Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should render home page container', () => {
    const wrapper = mount(Home, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    expect(wrapper.find('.home-page-marketing').exists()).toBe(true);
  });

  it('should show hero section with title', () => {
    const wrapper = mount(Home, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    expect(wrapper.find('.hero-content').exists()).toBe(true);
    expect(wrapper.find('.hero-title').text()).toContain('Small Squaretable');
  });

  it('should have navigation buttons', () => {
    const wrapper = mount(Home, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    const ctaButtons = wrapper.find('.cta-buttons');
    expect(ctaButtons.exists()).toBe(true);

    const buttons = ctaButtons.findAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    // Footer navigation links exist
    expect(wrapper.find('.footer-links').exists()).toBe(true);
  });
});
