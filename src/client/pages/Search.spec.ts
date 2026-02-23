/**
 * Search Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import Search from './Search.vue';

// Mock vue-router
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRoute = {
  query: { q: '' } as Record<string, string>,
};

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useRoute: () => mockRoute,
}));

// Mock search API
const mockGlobalSearch = vi.fn();
vi.mock('@client/services/search.api', () => ({
  searchApi: {
    globalSearch: (...args: unknown[]) => mockGlobalSearch(...args),
  },
}));

// Mock highlight utility
vi.mock('@client/utils/highlight', () => ({
  highlightText: (text: string) => text,
}));

// Mock icons
vi.mock('@element-plus/icons-vue', () => ({
  Search: { template: '<i />' },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': {} },
});

const stubs = {
  ChatLayout: { template: '<div><slot /></div>' },
  SearchFilterPanel: { template: '<div />' },
  ElInput: { template: '<input />', props: ['modelValue'] },
  ElTabs: { template: '<div><slot /></div>' },
  ElTabPane: { template: '<div><slot /></div>' },
  ElEmpty: { template: '<div class="el-empty" />' },
  ElSkeleton: { template: '<div />' },
  ElCard: { template: '<div class="el-card"><slot /></div>' },
  ElAvatar: { template: '<span />' },
  ElTag: { template: '<span />' },
  ElPagination: { template: '<div />' },
};

function mountSearch() {
  return mount(Search, {
    global: {
      plugins: [i18n],
      stubs,
    },
  });
}

describe('Search Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.query = { q: '' };
    mockGlobalSearch.mockReset();
  });

  it('renders search input and tabs', () => {
    const wrapper = mountSearch();

    expect(wrapper.find('.search-header').exists()).toBe(true);
    expect(wrapper.find('input').exists()).toBe(true);
    expect(wrapper.find('.search-results').exists()).toBe(true);
  });

  it('calls globalSearch on enter key', async () => {
    mockRoute.query = { q: '' };
    mockGlobalSearch.mockResolvedValue({
      characters: [],
      messages: [],
      worldbooks: [],
      total: 0,
    });

    const wrapper = mountSearch();
    const vm = wrapper.vm as any;

    vm.searchQuery = 'test query';
    await vm.doSearch();
    await flushPromises();

    expect(mockGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'test query' }),
    );
  });

  it('shows character results when data is returned', async () => {
    mockGlobalSearch.mockResolvedValue({
      characters: [
        { id: '1', name: 'Alice', description: 'A character', avatarUrl: null, tags: ['rpg'] },
      ],
      messages: [],
      worldbooks: [],
      total: 1,
    });

    const wrapper = mountSearch();
    const vm = wrapper.vm as any;

    vm.searchQuery = 'alice';
    await vm.doSearch();
    await flushPromises();

    expect(wrapper.find('.character-grid').exists()).toBe(true);
    expect(wrapper.find('.el-card').exists()).toBe(true);
  });

  it('shows empty state when no results', async () => {
    mockGlobalSearch.mockResolvedValue({
      characters: [],
      messages: [],
      worldbooks: [],
      total: 0,
    });

    const wrapper = mountSearch();
    const vm = wrapper.vm as any;

    vm.searchQuery = 'nonexistent';
    await vm.doSearch();
    await flushPromises();

    expect(wrapper.find('.el-empty').exists()).toBe(true);
  });
});
