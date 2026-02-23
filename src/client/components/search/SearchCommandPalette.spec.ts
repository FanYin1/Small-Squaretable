/**
 * SearchCommandPalette Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { ref } from 'vue';
import SearchCommandPalette from './SearchCommandPalette.vue';

const mockPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
  useRoute: vi.fn(() => ref({ query: {} })),
}));

vi.mock('@client/services/search.api', () => ({
  searchApi: {
    getSuggestions: vi.fn(),
  },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      search: {
        placeholder: 'Search...',
        characterSuggestions: 'Characters',
        recentSearches: 'Recent',
        noResults: 'No results',
        viewAllResults: 'View all results',
        pressEnterToSearch: 'Press Enter to search',
      },
    },
  },
});

const stubs = {
  ElIcon: { template: '<span class="el-icon"><slot /></span>' },
  Teleport: { template: '<div class="teleport"><slot /></div>' },
};

function mountPalette() {
  return mount(SearchCommandPalette, {
    global: {
      plugins: [i18n],
      stubs,
    },
  });
}

describe('SearchCommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on Ctrl+K keydown event', async () => {
    const wrapper = mountPalette();

    // Initially not visible
    expect(wrapper.find('.command-palette-overlay').exists()).toBe(false);

    // Simulate Ctrl+K
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.command-palette-overlay').exists()).toBe(true);
  });

  it('navigates to search page on Enter', async () => {
    const wrapper = mountPalette();

    // Open the palette
    const openEvent = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    });
    document.dispatchEvent(openEvent);
    await wrapper.vm.$nextTick();

    // Type a query
    const input = wrapper.find('.palette-input');
    await input.setValue('test query');

    // Press Enter
    await input.trigger('keydown.enter');

    expect(mockPush).toHaveBeenCalledWith({
      name: 'Search',
      query: { q: 'test query' },
    });
  });
});
