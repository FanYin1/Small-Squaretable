/**
 * GdprManagement Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import GdprManagement from './GdprManagement.vue';
import i18n from '../../i18n';

// Mock api
vi.mock('@client/services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            items: [
              {
                id: 'user-1',
                email: 'alice@example.com',
                displayName: 'Alice',
                deletionRequestedAt: '2026-02-01T00:00:00Z',
                scheduledAt: '2026-03-03T00:00:00Z',
              },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
          },
        }),
    }),
    post: vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }),
  },
}));

// Mock composables
vi.mock('@client/composables', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

// Mock element-plus ElMessageBox
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return { ...actual, ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') } };
});

const elStubs = {
  'el-button': { template: '<button><slot /></button>', props: ['icon', 'type', 'size'] },
  'el-table': { template: '<table class="el-table"><slot /></table>', props: ['data', 'stripe'] },
  'el-table-column': { template: '<col />', props: ['prop', 'label', 'width', 'minWidth', 'fixed'] },
  'el-pagination': { template: '<div class="el-pagination" />', props: ['currentPage', 'pageSize', 'total', 'layout'] },
  'el-empty': { template: '<div class="el-empty">{{ description }}</div>', props: ['description'] },
};

describe('GdprManagement Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should render GDPR table', () => {
    const wrapper = mount(GdprManagement, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    expect(wrapper.find('.gdpr-management').exists()).toBe(true);
    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.text()).toContain('GDPR Requests');
  });

  it('should show empty state when no requests', async () => {
    const { api } = await import('@client/services/api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            items: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
          },
        }),
    });

    const wrapper = mount(GdprManagement, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    // Wait for the async fetchRequests to complete
    await new Promise((r) => setTimeout(r, 10));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.el-empty').exists()).toBe(true);
  });
});
