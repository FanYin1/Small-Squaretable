/**
 * SearchFilterPanel Component Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import SearchFilterPanel from './SearchFilterPanel.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': {} },
});

const stubs = {
  ElRadioGroup: {
    template: '<div class="el-radio-group"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  ElRadioButton: {
    template: '<button class="el-radio-button" @click="$emit(\'click\')"><slot /></button>',
    props: ['value'],
  },
  ElDatePicker: { template: '<div class="el-date-picker" />' },
  ElSelect: {
    template: '<div class="el-select"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  ElOption: { template: '<div class="el-option" />' },
};

const defaultFilters = {
  type: 'all',
  dateRange: null as [Date, Date] | null,
  category: '',
  tags: [] as string[],
};

function mountPanel(props = {}) {
  return mount(SearchFilterPanel, {
    props: {
      modelValue: { ...defaultFilters },
      ...props,
    },
    global: {
      plugins: [i18n],
      stubs,
    },
  });
}

describe('SearchFilterPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all filter groups (type, date range, category, tags)', () => {
    const wrapper = mountPanel();

    const groups = wrapper.findAll('.filter-group');
    expect(groups.length).toBe(4);

    expect(wrapper.find('.el-radio-group').exists()).toBe(true);
    expect(wrapper.find('.el-date-picker').exists()).toBe(true);
    expect(wrapper.findAll('.el-select').length).toBe(2);
  });

  it('emits update:modelValue when type changes', async () => {
    const wrapper = mountPanel();
    const vm = wrapper.vm as any;

    // Call the internal updateField function directly
    vm.updateField('type', 'characters');
    await wrapper.vm.$nextTick();

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual(
      expect.objectContaining({ type: 'characters' }),
    );
  });

  it('emits update:modelValue when category changes', async () => {
    const wrapper = mountPanel();
    const vm = wrapper.vm as any;

    vm.updateField('category', 'anime');
    await wrapper.vm.$nextTick();

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual(
      expect.objectContaining({ category: 'anime' }),
    );
  });
});
