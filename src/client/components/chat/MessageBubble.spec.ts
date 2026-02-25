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
        },
      },
    });

    const replyBtn = wrapper.findAll('button.action-btn').find(btn => btn.attributes('aria-label') === 'Reply');
    expect(replyBtn).toBeTruthy();
    await replyBtn!.trigger('click');

    const emitted = wrapper.emitted('reply');
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual({ id: '1', content: 'Hello, world!', role: 'user' });
  });
});
