import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageBubble from './MessageBubble.vue';
import type { Message } from '@client/types';

describe('MessageBubble', () => {
  const createMessage = (role: 'user' | 'assistant' = 'user'): Message => ({
    id: '1',
    chatId: 'chat-1',
    role,
    content: 'Hello, world!',
    createdAt: new Date().toISOString(),
  });

  it('renders component', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage() },
      global: {
        stubs: {
          'el-button': true,
        },
      },
    });

    expect(wrapper.find('.message-bubble').exists()).toBe(true);
  });

  it('renders user message correctly', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage('user') },
      global: {
        stubs: {
          'el-button': true,
        },
      },
    });

    expect(wrapper.find('.message-user').exists()).toBe(true);
    expect(wrapper.text()).toContain('Hello, world!');
  });

  it('renders assistant message', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage('assistant') },
      global: {
        stubs: {
          'el-button': true,
        },
      },
    });

    expect(wrapper.find('.message-assistant').exists()).toBe(true);
  });

  it('displays message content', () => {
    const wrapper = mount(MessageBubble, {
      props: { message: createMessage() },
      global: {
        stubs: {
          'el-button': true,
        },
      },
    });

    expect(wrapper.find('.message-content').exists()).toBe(true);
  });
});
