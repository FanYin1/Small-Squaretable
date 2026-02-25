/**
 * AccountSettings Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AccountSettings from './AccountSettings.vue';
import i18n from '../i18n';

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

// Mock GDPR API
vi.mock('@client/services/gdpr.api', () => ({
  gdprApi: {
    exportData: vi.fn().mockResolvedValue(new Blob()),
    getDeletionStatus: vi.fn().mockResolvedValue({ pending: false, requestedAt: null, scheduledAt: null }),
    requestDeletion: vi.fn().mockResolvedValue(undefined),
    cancelDeletion: vi.fn().mockResolvedValue(undefined),
    getConsents: vi.fn().mockResolvedValue({ analytics: false, marketing: false, cookies: false }),
    updateConsents: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock element-plus
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus');
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  };
});

const elStubs = {
  'el-card': { template: '<div class="el-card"><slot /><slot name="header" /></div>', props: ['shadow'] },
  'el-button': { template: '<button class="el-button"><slot /></button>', props: ['loading', 'type', 'icon'] },
  'el-icon': { template: '<i><slot /></i>' },
  'el-alert': { template: '<div class="el-alert"><slot /><slot name="title" /></div>', props: ['type', 'closable', 'showIcon'] },
  'el-dialog': { template: '<div class="el-dialog"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width', 'closeOnClickModal'] },
  'el-form': { template: '<form class="el-form"><slot /></form>' },
  'el-form-item': { template: '<div class="el-form-item"><slot /></div>', props: ['label'] },
  'el-input': { template: '<input class="el-input" />', props: ['modelValue', 'type', 'showPassword', 'placeholder'] },
  'el-switch': { template: '<div class="el-switch" />', props: ['modelValue', 'disabled'] },
  DashboardLayout: {
    template: '<div class="dashboard-layout"><slot name="title" /><slot name="subtitle" /><slot /></div>',
  },
  Download: { template: '<span />' },
  Delete: { template: '<span />' },
  Setting: { template: '<span />' },
};

function mountPage() {
  return mount(AccountSettings, {
    global: {
      plugins: [i18n],
      stubs: elStubs,
      directives: { loading: () => {} },
    },
  });
}

describe('AccountSettings Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should render account settings page', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('.account-settings').exists()).toBe(true);
  });

  it('should show data export and account deletion sections', async () => {
    const wrapper = mountPage();
    await flushPromises();

    // Should have multiple settings cards (export, deletion, consents)
    const cards = wrapper.findAll('.el-card');
    expect(cards.length).toBeGreaterThanOrEqual(3);

    // Should have buttons for export and deletion actions
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
