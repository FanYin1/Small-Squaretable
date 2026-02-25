/**
 * WorldBooks Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WorldBooks from './WorldBooks.vue';
import i18n from '../i18n';

// Mock worldbook API
vi.mock('@client/services/worldbook.api', () => ({
  worldbookApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock composables
vi.mock('@client/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

// Mock element-plus
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return { ...actual, ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') } };
});

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

const elStubs = {
  'el-input': { template: '<input />', props: ['modelValue', 'placeholder', 'prefixIcon', 'clearable'] },
  'el-button': { template: '<button><slot /></button>', props: ['icon', 'type', 'loading'] },
  'el-table': { template: '<table class="el-table"><slot /></table>', props: ['data', 'stripe', 'emptyText'] },
  'el-table-column': { template: '<col />', props: ['prop', 'label', 'width', 'minWidth'] },
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type', 'size'] },
  'el-dialog': { template: '<div class="el-dialog" v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width'] },
  'el-form': { template: '<form><slot /></form>', props: ['labelPosition'] },
  'el-form-item': { template: '<div class="el-form-item"><slot /></div>', props: ['label', 'required'] },
  'el-select': { template: '<select><slot /></select>', props: ['modelValue'] },
  'el-option': { template: '<option />', props: ['value', 'label'] },
  'el-switch': { template: '<input type="checkbox" />', props: ['modelValue'] },
  'el-link': { template: '<a><slot /></a>', props: ['type', 'underline'] },
  'el-icon': { template: '<i><slot /></i>' },
  DashboardLayout: { template: '<div class="dashboard-layout"><slot name="title" /><slot name="subtitle" /><slot name="actions" /><slot /></div>' },
};

describe('WorldBooks Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should render world books page', () => {
    const wrapper = mount(WorldBooks, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    expect(wrapper.find('.worldbooks-page').exists()).toBe(true);
  });

  it('should have table element', () => {
    const wrapper = mount(WorldBooks, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    expect(wrapper.find('table').exists()).toBe(true);
  });
});
