import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import EmptyState from './EmptyState.vue';

describe('Story discovery empty states', () => {
  it.each(['no-results', 'no-data', 'error', 'permission-denied'] as const)('keeps %s distinct and exposes actionable recovery', async type => {
    const wrapper = mount(EmptyState, { props: { type }, global: { plugins: [i18n], stubs: {
      'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
    } } });
    expect(wrapper.attributes('role')).toBe(type === 'error' || type === 'permission-denied' ? 'alert' : 'status');
    expect(wrapper.attributes('data-type')).toBe(type);
    expect(wrapper.get('.empty-illustration').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.empty-title').text()).not.toBe('');
    const actions = wrapper.findAll('button');
    await actions[0].trigger('click');
    expect(wrapper.emitted('action-primary')).toHaveLength(1);
    if (actions.length > 1) {
      await actions[1].trigger('click');
      expect(wrapper.emitted('action-secondary')).toHaveLength(1);
    }
    wrapper.unmount();
  });
});
