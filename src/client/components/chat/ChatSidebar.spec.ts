import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ChatSidebar from './ChatSidebar.vue';
import i18n from '../../i18n';

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

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

const defaultStubs = {
  'el-button': true,
  'el-input': true,
  'el-empty': true,
  'el-skeleton': true,
  'el-avatar': true,
  'el-dropdown': true,
  'el-dropdown-menu': true,
  'el-dropdown-item': true,
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span><slot /></span>' },
};

describe('ChatSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders component', () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        plugins: [i18n],
        stubs: defaultStubs,
      },
    });
    expect(wrapper.find('.chat-sidebar').exists()).toBe(true);
  });

  it('renders sidebar header', () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        plugins: [i18n],
        stubs: defaultStubs,
      },
    });
    expect(wrapper.find('.sidebar-title').text()).toBe('Chats');
  });

  it('has search input', () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        plugins: [i18n],
        stubs: defaultStubs,
      },
    });
    expect(wrapper.find('.sidebar-search').exists()).toBe(true);
  });

  it('renders sidebar footer with nav buttons', () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        plugins: [i18n],
        stubs: defaultStubs,
      },
    });
    expect(wrapper.find('.sidebar-footer').exists()).toBe(true);
  });

  it('renders collapse button', () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        plugins: [i18n],
        stubs: defaultStubs,
      },
    });
    expect(wrapper.find('.collapse-btn').exists()).toBe(true);
  });

  it('emits toggle-collapse when collapse button clicked', async () => {
    const wrapper = mount(ChatSidebar, {
      global: {
        plugins: [i18n],
        stubs: defaultStubs,
      },
    });
    await wrapper.find('.collapse-btn').trigger('click');
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1);
  });
});
