/**
 * SecuritySettings Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SecuritySettings from './SecuritySettings.vue';
import i18n from '../i18n';

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

// Mock auth API (imported via @client/services)
vi.mock('@client/services', () => ({
  authApi: {
    mfaSetup: vi.fn().mockResolvedValue({ qrDataUrl: '', secret: '' }),
    mfaVerifySetup: vi.fn().mockResolvedValue({ backupCodes: [] }),
    mfaDisable: vi.fn().mockResolvedValue(undefined),
    mfaRegenerateBackupCodes: vi.fn().mockResolvedValue({ backupCodes: [] }),
  },
}));

// Mock composables
vi.mock('@client/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

// Mock user store
vi.mock('@client/stores/user', () => ({
  useUserStore: () => ({
    user: { id: 'u1', email: 'test@test.com' },
    fetchProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));

const elStubs = {
  'el-card': { template: '<div class="el-card"><slot /><slot name="header" /></div>', props: ['shadow'] },
  'el-button': { template: '<button class="el-button"><slot /></button>', props: ['loading', 'type', 'disabled', 'nativeType', 'text', 'plain'] },
  'el-icon': { template: '<i><slot /></i>', props: ['size', 'color'] },
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type', 'size'] },
  'el-steps': { template: '<div class="el-steps"><slot /></div>', props: ['active', 'alignCenter'] },
  'el-step': { template: '<div class="el-step" />', props: ['title'] },
  'el-form': { template: '<form class="el-form"><slot /></form>' },
  'el-form-item': { template: '<div class="el-form-item"><slot /></div>', props: ['label', 'error'] },
  'el-input': { template: '<input class="el-input" />', props: ['modelValue', 'placeholder', 'maxlength', 'size', 'clearable'] },
  'el-alert': { template: '<div class="el-alert"><slot /></div>', props: ['title', 'type', 'closable', 'showIcon'] },
  'el-dialog': { template: '<div class="el-dialog"><slot /></div>', props: ['modelValue', 'title', 'width', 'closeOnClickModal'] },
  DashboardLayout: {
    template: '<div class="dashboard-layout"><slot /></div>',
  },
  Lock: { template: '<span />' },
  Check: { template: '<span />' },
};

function mountPage() {
  return mount(SecuritySettings, {
    global: {
      plugins: [i18n],
      stubs: elStubs,
      directives: { loading: () => {} },
    },
  });
}

describe('SecuritySettings Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should render security settings page', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('.security-settings').exists()).toBe(true);
    expect(wrapper.find('.page-title').exists()).toBe(true);
  });

  it('should show 2FA setup section with enable button', async () => {
    const wrapper = mountPage();
    await flushPromises();

    // Should show the MFA card
    expect(wrapper.find('.mfa-card').exists()).toBe(true);

    // In idle state, should show the enable button and description
    expect(wrapper.find('.mfa-idle').exists()).toBe(true);
    expect(wrapper.find('.mfa-desc').exists()).toBe(true);

    // Should have at least one button (enable 2FA)
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});
