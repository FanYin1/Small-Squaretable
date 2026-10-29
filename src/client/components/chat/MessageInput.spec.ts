import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageInput from './MessageInput.vue';
import i18n from '../../i18n';
import { ref } from 'vue';
import { useChatStore } from '@client/stores/chat';
import { useUserStore } from '@client/stores/user';

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

vi.mock('@client/services/quick-reply.api', () => ({ getEnabledQuickReplies: vi.fn().mockResolvedValue([]) }));

const globalStubs = {
  'el-input': {
    template: '<div class="el-input-stub"><textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
    props: ['modelValue', 'type', 'placeholder', 'autosize', 'maxlength', 'disabled', 'resize'],
  },
  'el-button': { template: '<button><slot /></button>' },
  'el-icon': { template: '<span class="el-icon-stub"><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
};

describe('MessageInput', () => {
  it('appends recovered text to the current draft without sending it', async () => {
    setActivePinia(createPinia());
    const focus = vi.fn();
    const wrapper = mount(MessageInput, { global: { plugins: [i18n], stubs: {
      ...globalStubs, 'el-input': { ...globalStubs['el-input'], methods: { focus } },
    } } });
    await wrapper.get('textarea').setValue('还没发出的新草稿');
    wrapper.vm.fillAction('取回的长输入');
    await wrapper.vm.$nextTick();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('还没发出的新草稿\n取回的长输入');
    expect(wrapper.emitted('send')).toBeUndefined();
    expect(focus).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('does not send while committing Chinese input', async () => {
    setActivePinia(createPinia());
    const wrapper = mount(MessageInput, { global: { plugins: [i18n], stubs: globalStubs } });
    await wrapper.get('textarea').setValue('我把车票翻过来');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', isComposing: true });
    expect(wrapper.emitted('send')).toBeUndefined();
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(wrapper.emitted('send')).toBeUndefined();
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('send')?.[0][0]).toBe('我把车票翻过来');
    wrapper.unmount();
  });

  it('disables repeated stop requests while awaiting completion', async () => {
    setActivePinia(createPinia());
    const wrapper = mount(MessageInput, { props: { isStreaming: true }, global: { plugins: [i18n], stubs: globalStubs } });
    await wrapper.get('.stop-btn').trigger('click');
    expect(wrapper.emitted('stopGeneration')).toHaveLength(1);
    await wrapper.setProps({ stopping: true });
    expect((wrapper.get('.stop-btn').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
  });

  it('keeps submitted input until persistence is acknowledged', async () => {
    const wrapper = mount(MessageInput, { global: { plugins: [i18n], stubs: globalStubs } });
    await wrapper.get('textarea').setValue('我推开门');
    await wrapper.get('.send-btn').trigger('click');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('我推开门');
    const accept = wrapper.emitted('send')![0][3] as () => void;
    accept();
    await wrapper.vm.$nextTick();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
    wrapper.unmount();
  });

  it('restores drafts for the signed-in account and selected story', async () => {
    const userStore = useUserStore();
    userStore.user = { id: 'reader', tenantId: 'tenant' } as NonNullable<typeof userStore.user>;
    const chatStore = useChatStore();
    chatStore.currentChatId = 'story-a';
    let wrapper = mount(MessageInput, { global: { plugins: [i18n], stubs: globalStubs } });
    await wrapper.get('textarea').setValue('第一段');
    chatStore.currentChatId = 'story-b';
    await wrapper.vm.$nextTick();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
    await wrapper.get('textarea').setValue('第二段');
    chatStore.currentChatId = 'story-a';
    await wrapper.vm.$nextTick();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('第一段');
    wrapper.unmount();
    wrapper = mount(MessageInput, { global: { plugins: [i18n], stubs: globalStubs } });
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('第一段');
    expect(wrapper.get('[role="status"]').text()).toContain('Restored');
    userStore.user = { id: 'other-reader', tenantId: 'tenant' } as NonNullable<typeof userStore.user>;
    await wrapper.vm.$nextTick();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
    wrapper.unmount();
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
