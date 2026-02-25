/**
 * UserManagement Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import UserManagement from './UserManagement.vue';
import i18n from '../../i18n';

// Mock admin API
vi.mock('@client/services/admin.api', () => ({
  adminApi: {
    getUsers: vi.fn().mockResolvedValue({ users: [], total: 0, page: 1, limit: 20 }),
    getUser: vi.fn().mockResolvedValue({
      id: '1',
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'user',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    }),
    changeRole: vi.fn(),
    suspendUser: vi.fn(),
    unsuspendUser: vi.fn(),
    forcePasswordReset: vi.fn(),
  },
}));

const elStubs = {
  'el-input': { template: '<input />', props: ['modelValue', 'placeholder', 'prefixIcon', 'clearable'] },
  'el-button': { template: '<button><slot /></button>' },
  'el-table': { template: '<table class="el-table"><slot /></table>', props: ['data', 'stripe'] },
  'el-table-column': { template: '<col />', props: ['prop', 'label', 'width', 'minWidth', 'fixed'] },
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type', 'size'] },
  'el-pagination': { template: '<div class="el-pagination" />', props: ['currentPage', 'pageSize', 'total', 'layout'] },
  'el-dropdown': { template: '<div><slot /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' },
  'el-drawer': { template: '<div class="el-drawer" v-if="modelValue"><slot /></div>', props: ['modelValue', 'title', 'size', 'direction'] },
  'el-avatar': { template: '<div class="el-avatar"><slot /></div>', props: ['size', 'src'] },
  'el-descriptions': { template: '<div class="el-descriptions"><slot /></div>', props: ['column', 'border'] },
  'el-descriptions-item': { template: '<div class="el-descriptions-item"><slot /></div>', props: ['label'] },
};

describe('UserManagement Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should render user table', () => {
    const wrapper = mount(UserManagement, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
      },
    });

    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.find('.user-management').exists()).toBe(true);
  });

  it('should have drawer component in template', () => {
    const wrapper = mount(UserManagement, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
      },
    });

    // Drawer is present but hidden (drawerVisible is false by default)
    const vm = wrapper.vm as any;
    expect(vm.drawerVisible).toBe(false);
    expect(vm.selectedUser).toBeNull();

    // Open drawer
    vm.drawerVisible = true;
  });
});
