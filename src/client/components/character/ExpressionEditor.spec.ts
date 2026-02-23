import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ExpressionEditor from './ExpressionEditor.vue';
import i18n from '../../i18n';

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return {
    ...actual,
    ElMessage: { error: vi.fn(), success: vi.fn() },
  };
});

function createWrapper(props: { modelValue?: Record<string, string> } = {}) {
  return mount(ExpressionEditor, {
    props,
    global: {
      plugins: [i18n],
      stubs: {
        'el-select': {
          template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
          props: ['modelValue'],
        },
        'el-option': {
          template: '<option :value="value">{{ label }}</option>',
          props: ['label', 'value'],
        },
        'el-button': {
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  });
}

describe('ExpressionEditor', () => {
  it('renders all 14 emotion label cards', () => {
    const wrapper = createWrapper();
    const cards = wrapper.findAll('.expression-card');
    expect(cards).toHaveLength(14);

    const labels = cards.map(c => c.find('.expression-label').text());
    expect(labels).toContain('Neutral');
    expect(labels).toContain('Default');
    expect(labels).toContain('Happy');
    expect(labels).toContain('Angry');
    expect(labels).toContain('Disgusted');
  });

  it('emits update:modelValue when expression is set programmatically', async () => {
    const wrapper = createWrapper({ modelValue: {} });

    await wrapper.setProps({
      modelValue: { happy: 'data:image/png;base64,abc123' },
    });
    await nextTick();

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    const lastEmit = emitted![emitted!.length - 1][0] as Record<string, string>;
    expect(lastEmit).toHaveProperty('happy', 'data:image/png;base64,abc123');
  });

  it('shows preview image when expression URL exists', async () => {
    const wrapper = createWrapper({
      modelValue: { neutral: 'data:image/png;base64,neutralImg' },
    });
    await nextTick();

    expect(wrapper.find('.expression-preview-section').exists()).toBe(true);
    const previewImg = wrapper.find('.large-preview');
    expect(previewImg.exists()).toBe(true);
    expect(previewImg.attributes('src')).toBe('data:image/png;base64,neutralImg');
  });

  it('preview falls back to neutral when selected emotion has no sprite', async () => {
    const wrapper = createWrapper({
      modelValue: { neutral: 'data:image/png;base64,neutralFallback' },
    });
    await nextTick();

    // Preview defaults to 'neutral' emotion, which has a sprite
    const previewImg = wrapper.find('.large-preview');
    expect(previewImg.exists()).toBe(true);
    expect(previewImg.attributes('src')).toBe('data:image/png;base64,neutralFallback');

    // Change preview to an emotion without a sprite — should fall back to neutral
    const select = wrapper.find('select');
    await select.setValue('angry');
    await nextTick();

    const fallbackImg = wrapper.find('.large-preview');
    expect(fallbackImg.exists()).toBe(true);
    expect(fallbackImg.attributes('src')).toBe('data:image/png;base64,neutralFallback');
  });
});
