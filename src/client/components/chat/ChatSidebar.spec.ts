import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ChatSidebar from './ChatSidebar.vue';
import i18n from '../../i18n';
import { useChatStore } from '@client/stores/chat';

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
  useRoute: () => ({ name: 'Chat' }),
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
    expect(wrapper.find('.sidebar-title').text()).toBe('My stories');
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

  it('shows a directly accessible delete button in the upper-right actions of each story', () => {
    useChatStore().chats = [
      { id: 'story-1', title: '蔚蓝星域', characterId: 'character-1', characterName: '蔚蓝星域', createdAt: new Date().toISOString() },
      { id: 'story-2', title: '另一段故事', characterId: 'character-2', characterName: '角色二', createdAt: new Date().toISOString() },
    ];

    const wrapper = mount(ChatSidebar, {
      global: { plugins: [i18n], stubs: defaultStubs },
    });

    const rows = wrapper.findAll('.chat-item');
    expect(rows).toHaveLength(2);
    expect(rows[0].find('.chat-item-actions').find('.chat-item-delete').attributes('aria-label')).toContain('蔚蓝星域');
    expect(rows[1].find('.chat-item-actions').find('.chat-item-delete').attributes('aria-label')).toContain('另一段故事');

    wrapper.unmount();
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
