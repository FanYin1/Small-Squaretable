import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import ChatTemplates from './ChatTemplates.vue';
import { useChatTemplateStore } from '@client/stores/chatTemplate';

vi.mock('@client/services/chat-template.api', () => ({
  chatTemplateApi: {
    getTemplates: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    useTemplate: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@client/components/layout/DashboardLayout.vue', () => ({
  default: {
    name: 'DashboardLayout',
    template: '<div class="mock-layout"><slot /><slot name="title" /><slot name="actions" /></div>',
  },
}));

const enUS = {
  common: { edit: 'Edit', delete: 'Delete', cancel: 'Cancel', save: 'Save', retry: 'Please try again later' },
  chatTemplates: {
    title: 'Chat Templates',
    create: 'Create Template',
    edit: 'Edit Template',
    name: 'Name',
    description: 'Description',
    systemPrompt: 'System Prompt',
    firstMessage: 'First Message',
    isPublic: 'Public',
    deleteConfirm: 'Delete this template?',
    createSuccess: 'Template created',
    updateSuccess: 'Template updated',
    deleteSuccess: 'Template deleted',
    empty: 'No templates yet',
  },
};

function createWrapper() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: { 'en-US': enUS },
  });

  return mount(ChatTemplates, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        ElButton: { template: '<button><slot /></button>', props: ['type', 'text'] },
        ElSkeleton: { template: '<div class="el-skeleton" />' },
        ElEmpty: { template: '<div class="el-empty">{{ description }}</div>', props: ['description'] },
        ElTag: { template: '<span class="el-tag"><slot /></span>' },
        ElDialog: { template: '<div class="el-dialog" v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title'] },
        ElForm: { template: '<form><slot /></form>' },
        ElFormItem: { template: '<div class="el-form-item"><slot /></div>', props: ['label'] },
        ElInput: { template: '<input />', props: ['modelValue', 'type', 'rows'] },
        ElSwitch: { template: '<input type="checkbox" />', props: ['modelValue'] },
      },
    },
  });
}

describe('ChatTemplates Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders template list when templates exist', async () => {
    const wrapper = createWrapper();
    const store = useChatTemplateStore();

    store.loading = false;
    store.ownTemplates = [
      {
        id: 'tpl-1',
        userId: 'u1',
        name: 'My Template',
        description: 'A test template',
        systemPrompt: 'Be helpful',
        firstMessage: 'Hello',
        tags: ['test', 'demo'],
        isPublic: false,
        usageCount: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    await nextTick();

    expect(wrapper.find('.template-list').exists()).toBe(true);
    expect(wrapper.find('.template-name').text()).toBe('My Template');
    expect(wrapper.find('.template-desc').text()).toBe('A test template');
    expect(wrapper.findAll('.el-tag')).toHaveLength(2);
  });

  it('shows empty state when no templates', async () => {
    const wrapper = createWrapper();
    const store = useChatTemplateStore();

    store.loading = false;
    store.ownTemplates = [];

    await nextTick();

    expect(wrapper.find('.el-empty').exists()).toBe(true);
    expect(wrapper.find('.template-list').exists()).toBe(false);
  });
});
