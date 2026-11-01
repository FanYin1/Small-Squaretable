import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ModelPicker from './ModelPicker.vue';
import i18n from '../../i18n';

const models = Array.from({ length: 7 }, (_, i) => ({
  id: `configured-model-${i}`, provider: 'custom', contextWindow: 1_000_000,
  maxOutputTokens: 4096, defaultTemperature: .7,
}));
const global = { plugins: [i18n], stubs: {
  'el-popover': { name: 'el-popover', props: ['visible'], template: '<div><slot name="reference" /><div v-if="visible"><slot /></div></div>' },
  'el-icon': { template: '<span><slot /></span>' },
} };

async function open(wrapper: ReturnType<typeof mount>) {
  wrapper.getComponent({ name: 'el-popover' }).vm.$emit('update:visible', true);
  await nextTick();
}

describe('ModelPicker', () => {
  it('refreshes on every open and shows updated models without remounting', async () => {
    const wrapper = mount(ModelPicker, { props: { models: models.slice(0, 1), modelValue: models[0].id }, global });
    await open(wrapper);
    expect(wrapper.emitted('refresh')).toHaveLength(1);
    await wrapper.get('.model-picker-panel').trigger('keydown', { key: 'Escape' });
    await open(wrapper);
    expect(wrapper.emitted('refresh')).toHaveLength(2);
    await wrapper.setProps({ loading: true });
    expect(wrapper.get('[role="status"]').text()).toBe(i18n.global.t('modelPicker.loading'));
    expect(wrapper.get('.model-picker-option').attributes('disabled')).toBeDefined();
    await wrapper.get('.model-picker-option').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
    await wrapper.setProps({ loading: false, models: models.slice(0, 2) });
    expect(wrapper.findAll('.model-picker-option')).toHaveLength(2);
    await wrapper.findAll('.model-picker-option')[1].trigger('click');
    expect(wrapper.emitted('select')).toEqual([[models[1].id]]);
    wrapper.unmount();
  });

  it('offers a retry when refreshing fails', async () => {
    const wrapper = mount(ModelPicker, { props: { models: [], modelValue: '', error: 'Refresh failed' }, global });
    await open(wrapper);
    expect(wrapper.get('[role="alert"]').text()).toContain('Refresh failed');
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(2);
    wrapper.unmount();
  });

  it('includes the actual selected model beyond the initial five and searches all configured models', async () => {
    const wrapper = mount(ModelPicker, { props: { models, modelValue: models[6].id }, global });
    await open(wrapper);
    expect(wrapper.findAll('[role="menuitemradio"]')).toHaveLength(5);
    expect(wrapper.get('[aria-checked="true"]').text()).toContain(models[6].id);
    expect(wrapper.text()).not.toContain('Auto');
    await wrapper.get('.model-picker-more').trigger('click');
    await wrapper.get('input').setValue('model-5');
    expect(wrapper.findAll('[role="menuitemradio"]')).toHaveLength(1);
    await wrapper.get('.model-picker-option').trigger('click');
    expect(wrapper.emitted('select')).toEqual([[models[5].id]]);
    expect(wrapper.get('.model-picker-trigger').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('supports keyboard navigation and Escape focus recovery without selecting a model', async () => {
    const wrapper = mount(ModelPicker, { props: { models, modelValue: models[0].id }, global, attachTo: document.body });
    await open(wrapper);
    const options = wrapper.findAll<HTMLButtonElement>('.model-picker-option');
    options[0].element.focus();
    await options[0].trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[1].element);
    await options[1].trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(options[4].element);
    await wrapper.get('.model-picker-panel').trigger('keydown', { key: 'Escape' });
    expect(document.activeElement).toBe(wrapper.get('.model-picker-trigger').element);
    expect(wrapper.emitted('select')).toBeUndefined();
    await open(wrapper);
    await wrapper.get('.model-picker-trigger').trigger('keydown', { key: 'Escape' });
    expect(wrapper.get('.model-picker-trigger').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('does not switch when selecting the current model, and closes when generation starts', async () => {
    const wrapper = mount(ModelPicker, { props: { models, modelValue: models[0].id }, global });
    await open(wrapper);
    await wrapper.get('[aria-checked="true"]').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
    await open(wrapper);
    await wrapper.setProps({ disabled: true });
    expect(wrapper.get('.model-picker-trigger').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.model-picker-trigger').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
});
