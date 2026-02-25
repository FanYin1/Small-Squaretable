/**
 * CharacterDetail Page Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CharacterDetail from './CharacterDetail.vue';
import i18n from '../i18n';

// Mock API service
vi.mock('@client/services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue(null),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock character collection API
vi.mock('@client/services/character-collection.api', () => ({
  characterCollectionApi: {
    getCollections: vi.fn().mockResolvedValue([]),
    addCharacters: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock sillytavern utils
vi.mock('@client/utils/sillytavern', () => ({
  downloadCharacterJson: vi.fn(),
}));

// Mock composables
vi.mock('@client/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

// Mock element-plus
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } };
});

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'test-char-id' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

const elStubs = {
  'el-avatar': { template: '<div class="el-avatar"><slot /></div>', props: ['size', 'src'] },
  'el-button': { template: '<button><slot /></button>', props: ['icon', 'type', 'loading'] },
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type'] },
  'el-icon': { template: '<i><slot /></i>' },
  'el-dropdown': { template: '<div><slot /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' },
  DashboardLayout: { template: '<div class="dashboard-layout"><slot name="title" /><slot name="actions" /><slot /></div>' },
  RatingComponent: { template: '<div class="rating-stub" />', props: ['modelValue', 'readonly', 'showScore', 'showCount', 'count'] },
  FavoriteButton: { template: '<button class="favorite-stub" />', props: ['characterId'] },
  CommentSection: { template: '<div class="comment-stub" />', props: ['characterId'] },
  ShareDialog: { template: '<div class="share-stub" />', props: ['modelValue', 'character'] },
  CharacterStats: { template: '<div class="stats-stub" />', props: ['character'] },
};

describe('CharacterDetail Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should render character detail page', () => {
    const wrapper = mount(CharacterDetail, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    expect(wrapper.find('.character-detail-page').exists()).toBe(true);
  });

  it('should show loading state initially', () => {
    const wrapper = mount(CharacterDetail, {
      global: {
        plugins: [i18n],
        stubs: elStubs,
        directives: { loading: () => {} },
      },
    });

    // loading is true initially (set to false after onMounted completes)
    const vm = wrapper.vm as any;
    expect(vm.loading).toBe(true);
  });
});
