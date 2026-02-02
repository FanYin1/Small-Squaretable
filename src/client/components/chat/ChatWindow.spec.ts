import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ChatWindow from './ChatWindow.vue';
import type { Chat } from '@client/types';

describe('ChatWindow', () => {
  let mockChat: Chat;

  beforeEach(() => {
    setActivePinia(createPinia());

    mockChat = {
      id: 'chat-1',
      title: 'Test Chat',
      characterId: 'char-1',
      characterName: 'Test Character',
      createdAt: new Date().toISOString(),
    };
  });

  it('renders component', () => {
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: {
        stubs: {
          'el-avatar': true,
          'el-button': true,
          'el-empty': true,
          'el-skeleton': true,
          'MessageBubble': true,
          'MessageInput': true,
        },
      },
    });

    expect(wrapper.find('.chat-window').exists()).toBe(true);
  });

  it('renders chat header with character info', () => {
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: {
        stubs: {
          'el-avatar': true,
          'el-button': true,
          'el-empty': true,
          'el-skeleton': true,
          'MessageBubble': true,
          'MessageInput': true,
        },
      },
    });

    expect(wrapper.find('.chat-title').text()).toBe('Test Chat');
    expect(wrapper.find('.chat-subtitle').text()).toBe('Test Character');
  });

  it('has messages container', () => {
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: {
        stubs: {
          'el-avatar': true,
          'el-button': true,
          'el-empty': true,
          'el-skeleton': true,
          'MessageBubble': true,
          'MessageInput': true,
        },
      },
    });

    expect(wrapper.find('.chat-messages').exists()).toBe(true);
  });

  it('has input container', () => {
    const wrapper = mount(ChatWindow, {
      props: { currentChat: mockChat },
      global: {
        stubs: {
          'el-avatar': true,
          'el-button': true,
          'el-empty': true,
          'el-skeleton': true,
          'MessageBubble': true,
          'MessageInput': true,
        },
      },
    });

    expect(wrapper.find('.chat-input-container').exists()).toBe(true);
  });
});
