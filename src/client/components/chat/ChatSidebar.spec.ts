import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ChatSidebar from './ChatSidebar.vue';

vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn(),
    prompt: vi.fn(),
  },
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ChatSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders component', () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        stubs: {
          'el-button': true,
          'el-input': true,
          'el-empty': true,
          'el-skeleton': true,
          'el-avatar': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true,
        },
      },
    });
    expect(wrapper.find('.chat-sidebar').exists()).toBe(true);
  });

  it('renders sidebar header', () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        stubs: {
          'el-button': true,
          'el-input': true,
          'el-empty': true,
          'el-skeleton': true,
          'el-avatar': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true,
        },
      },
    });
    expect(wrapper.find('.sidebar-title').text()).toBe('Chats');
  });

  it('has search input', () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        stubs: {
          'el-button': true,
          'el-input': true,
          'el-empty': true,
          'el-skeleton': true,
          'el-avatar': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true,
        },
      },
    });
    expect(wrapper.find('.sidebar-search').exists()).toBe(true);
  });
});
