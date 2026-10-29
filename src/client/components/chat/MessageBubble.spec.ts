import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import MessageBubble from './MessageBubble.vue';
import type { Message } from '@client/types';
import i18n from '../../i18n';

describe('MessageBubble', () => {
  const createMessage = (role: 'user' | 'assistant' = 'user'): Message => ({
    id: '1',
    chatId: 'chat-1',
    role,
    content: 'Hello, world!',
    createdAt: new Date().toISOString(),
  });

  const mountOptions = () => ({
    global: {
      plugins: [i18n, createPinia()],
      stubs: {
        'el-button': true,
        MarkdownRenderer: true,
      },
    },
  });

  it('renders component', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage() },
      ...mountOptions(),
    });

    expect(wrapper.find('.message').exists()).toBe(true);
  });

  it('renders user message correctly', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage('user') },
      ...mountOptions(),
    });

    expect(wrapper.find('.message-user').exists()).toBe(true);
    expect(wrapper.text()).toContain('Hello, world!');
  });

  it('renders assistant message', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage('assistant') },
      ...mountOptions(),
    });

    expect(wrapper.find('.message-assistant').exists()).toBe(true);
  });

  it('explains invalid story output without implying the player input was unclear', () => {
    const message = { ...createMessage('assistant'), extra: { stateStatus: 'interrupted', storyIntentInvalid: true } };
    const wrapper = mount(MessageBubble, { props: { message }, ...mountOptions() });

    expect(wrapper.text()).toContain('模型回复未通过剧情结构校验');
    expect(wrapper.text()).toContain('未提交状态变化');
    expect(wrapper.text()).not.toContain('行动理解');
    expect(wrapper.text()).not.toContain('未完成的片段');
  });

  it('displays message content', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage() },
      ...mountOptions(),
    });

    expect(wrapper.find('.message-body').exists()).toBe(true);
  });

  it('shows reply quote when message has replyTo in extra', () => {
    const message: Message = {
      id: '2',
      chatId: 'chat-1',
      role: 'user',
      content: 'Hello',
      createdAt: new Date().toISOString(),
      extra: { replyTo: { messageId: '1', content: 'Previous message', role: 'assistant' } },
    };
    const wrapper = mount(MessageBubble, {
      props: { message },
      ...mountOptions(),
    });

    expect(wrapper.find('.reply-quote').exists()).toBe(true);
    expect(wrapper.text()).toContain('Previous message');
    expect(wrapper.text()).toContain('assistant');
  });

  it('emits reply event when reply button clicked', async () => {
    const message = createMessage('user');
    const wrapper = mount(MessageBubble, {
      props: { message },
      global: {
        plugins: [i18n, createPinia()],
        stubs: {
          MarkdownRenderer: true,
          'el-popover': { template: '<div><slot /><slot name="reference" /></div>' },
        },
      },
    });

    // Reply button is inside the more-menu (el-popover content), not a direct action-btn
    const replyBtn = wrapper.findAll('.more-menu-item').find(btn => btn.text().includes('Reply') || btn.text().includes('回复'));
    expect(replyBtn).toBeTruthy();
    await replyBtn!.trigger('click');

    const emitted = wrapper.emitted('reply');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({ id: '1', content: 'Hello, world!', role: 'user' });
  });

  it('opens correction for the selected original message and returns focus to its reading menu', async () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage('assistant'), historyFixed: true, canCorrect: true },
      attachTo: document.body,
      global: { plugins: [i18n, createPinia()], stubs: {
        MarkdownRenderer: true,
        'el-popover': { template: '<div><slot /><slot name="reference" /></div>' },
      } },
    });
    const correction = wrapper.findAll('.more-menu-item').find(button => button.text() === '标注 / 纠正此处')!;
    await correction.trigger('click');
    expect(wrapper.emitted('correct')).toEqual([['1']]);
    expect(document.activeElement).toBe(wrapper.get('.action-more').element);
    expect(wrapper.get('.action-more').attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('.action-btn').some(button => button.attributes('aria-label')?.includes('Regenerate'))).toBe(false);
    await wrapper.setProps({ canCorrect: false });
    expect(wrapper.findAll('.more-menu-item').some(button => button.text() === '标注 / 纠正此处')).toBe(false);
    wrapper.unmount();
  });
});
