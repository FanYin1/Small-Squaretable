/**
 * ActivityFeed Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ActivityFeed from './ActivityFeed.vue';
import { useSocialStore } from '@client/stores/social';
import i18n from '../i18n';

// Mock social API
import { socialApi } from '@client/services/social.api';
vi.mock('@client/services/social.api', () => ({
  socialApi: {
    getFeed: vi.fn().mockResolvedValue([]),
    getUserActivities: vi.fn().mockResolvedValue([]),
    likeComment: vi.fn().mockResolvedValue(undefined),
    unlikeComment: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

// Mock composables
vi.mock('@client/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

vi.mock('@client/composables/useDateTime', () => ({
  useDateTime: () => ({ formatRelativeTime: vi.fn().mockReturnValue('just now') }),
}));

vi.mock('@client/composables', () => ({
  useTheme: () => ({ isDark: { value: false }, toggleTheme: vi.fn() }),
}));

const elStubs = {
  'el-skeleton': { template: '<div class="el-skeleton" />', props: ['rows', 'animated'] },
  'el-button': { template: '<button><slot /></button>', props: ['loading'] },
  'el-icon': { template: '<i><slot /></i>' },
  DashboardLayout: {
    template: '<div class="dashboard-layout"><slot name="title" /><slot /></div>',
  },
  ActivityItem: { template: '<div class="activity-item-stub" />', props: ['activity'] },
};

function mountPage() {
  return mount(ActivityFeed, {
    global: {
      plugins: [i18n],
      stubs: elStubs,
      directives: { loading: () => {} },
    },
  });
}

describe('ActivityFeed Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Reset to default resolved value (clearAllMocks doesn't reset implementations)
    vi.mocked(socialApi.getFeed).mockResolvedValue([]);
  });

  it('should render activity feed page', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('.activity-feed').exists()).toBe(true);
  });

  it('should show loading state when feedLoading is true', async () => {
    // Make getFeed hang so feedLoading stays true
    vi.mocked(socialApi.getFeed).mockReturnValue(new Promise(() => {}));

    const wrapper = mountPage();
    // Let onMounted fire and set feedLoading = true
    await wrapper.vm.$nextTick();

    const store = useSocialStore();
    expect(store.feedLoading).toBe(true);
    expect(wrapper.find('.feed-skeleton').exists()).toBe(true);
  });

  it('should show empty state when no activities', async () => {
    const wrapper = mountPage();
    // Wait for fetchFeed to resolve (returns empty array)
    await flushPromises();
    await wrapper.vm.$nextTick();

    const store = useSocialStore();
    expect(store.activities.length).toBe(0);
    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });
});
