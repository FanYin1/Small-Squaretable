import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageInput from './MessageInput.vue';
import i18n from '../../i18n';
import { ref } from 'vue';

vi.mock('@client/composables/useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: ref(false),
    duration: ref(0),
    error: ref(null),
    isSupported: ref(false),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
  }),
}));

vi.mock('@client/composables/useSpeechToText', () => ({
  useSpeechToText: () => ({
    isListening: ref(false),
    transcript: ref(''),
    interimTranscript: ref(''),
    isSupported: ref(false),
    error: ref(null),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    clearTranscript: vi.fn(),
  }),
}));

vi.mock('@client/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

const globalStubs = {
  'el-input': {
    template: '<div class="el-input-stub"><textarea /></div>',
    props: ['modelValue', 'type', 'placeholder', 'autosize', 'maxlength', 'disabled', 'resize'],
  },
  'el-button': { template: '<button><slot /></button>' },
  'el-icon': { template: '<span class="el-icon-stub"><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
};

describe('MessageInput', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders component', () => {
    const wrapper = mount(MessageInput, {
      global: {
        plugins: [i18n],
        stubs: globalStubs,
      },
    });
    expect(wrapper.find('.message-input').exists()).toBe(true);
  });

  it('has correct default props', () => {
    const wrapper = mount(MessageInput, {
      global: {
        plugins: [i18n],
        stubs: globalStubs,
      },
    });
    expect(wrapper.props('maxLength')).toBe(4000);
  });

  it('accepts custom props', () => {
    const wrapper = mount(MessageInput, {
      props: {
        placeholder: 'Custom placeholder',
        maxLength: 2000,
        disabled: true,
      },
      global: {
        plugins: [i18n],
        stubs: globalStubs,
      },
    });
    expect(wrapper.props('placeholder')).toBe('Custom placeholder');
    expect(wrapper.props('maxLength')).toBe(2000);
    expect(wrapper.props('disabled')).toBe(true);
  });
});
