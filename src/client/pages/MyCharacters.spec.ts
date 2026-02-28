/**
 * MyCharacters page tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import i18n from '../i18n';
import MyCharacters from './MyCharacters.vue';

// --- Mocks ---

const mockPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: {} }),
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();

vi.mock('@client/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

const mockGetCharacters = vi.fn();

vi.mock('@client/services/character.api', () => ({
  characterApi: {
    getCharacters: (...args: unknown[]) => mockGetCharacters(...args),
    batchDelete: vi.fn(),
    batchUpdateTags: vi.fn(),
    duplicateCharacter: vi.fn(),
  },
}));

vi.mock('@client/services/export.api', () => ({
  exportApi: {
    batchExportCharacters: vi.fn(),
    batchImportCharacters: vi.fn(),
  },
}));

vi.mock('@client/services/character-collection.api', () => ({
  characterCollectionApi: {
    getCollections: vi.fn().mockResolvedValue([]),
    getCollectionCharacters: vi.fn().mockResolvedValue([]),
    addCharacters: vi.fn(),
  },
}));

vi.mock('@client/composables/useFeatureGate', () => ({
  useFeatureGate: () => ({
    hasFeature: () => true,
    currentPlan: { value: 'pro' },
  }),
}));

vi.mock('@client/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@client/utils/sillytavern', () => ({
  downloadCharacterJson: vi.fn(),
  readCharacterFile: vi.fn(),
}));

vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}));

const sampleCharacters = [
  {
    id: '1',
    name: 'Alice',
    description: 'A friendly character',
    avatarUrl: null,
    tags: ['fantasy'],
    isPublic: false,
    isNsfw: false,
    category: 'Fantasy',
    downloadCount: 0,
    viewCount: 0,
    ratingCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'Bob',
    description: 'A brave character',
    avatarUrl: null,
    tags: ['adventure'],
    isPublic: false,
    isNsfw: false,
    category: 'Adventure',
    downloadCount: 0,
    viewCount: 0,
    ratingCount: 0,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

const stubs = {
  DashboardLayout: {
    template: '<div class="dashboard-layout"><slot name="title" /><slot name="center" /><slot name="actions" /><slot /></div>',
  },
  CollectionSidebar: { template: '<div class="collection-sidebar" />' },
  CharacterCard: {
    template: '<div class="character-card">{{ character.name }}</div>',
    props: ['character'],
  },
  EmptyState: {
    template: '<div class="empty-state" :data-type="type"><slot /></div>',
    props: ['type'],
  },
  CharacterPublishForm: { template: '<div />' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-button': { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>' },
  'el-tabs': { template: '<div class="el-tabs"><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div class="el-tab-pane"><slot /><slot name="label" /></div>', props: ['name'] },
  'el-checkbox': { template: '<input type="checkbox" />', props: ['modelValue'] },
  'el-dialog': { template: '<div v-if="$attrs.modelValue"><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { template: '<select><slot /></select>' },
  'el-icon': { template: '<i />' },
};

function mountPage(items = sampleCharacters) {
  mockGetCharacters.mockResolvedValue({ characters: items });

  return mount(MyCharacters, {
    global: {
      plugins: [i18n],
      stubs,
    },
  });
}

describe('MyCharacters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders character cards when data exists', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await nextTick();

    const cards = wrapper.findAll('.character-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].text()).toContain('Alice');
    expect(cards[1].text()).toContain('Bob');
  });

  it('shows batch action bar when batch mode is active and items selected', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await nextTick();

    // Batch actions should not be visible initially
    expect(wrapper.find('.batch-actions').exists()).toBe(false);

    // Enable batch mode and select an item
    const vm = wrapper.vm as any;
    vm.batchMode = true;
    vm.selectedIds = ['1'];
    await nextTick();

    expect(wrapper.find('.batch-actions').exists()).toBe(true);
    expect(wrapper.find('.batch-count').exists()).toBe(true);
  });

  it('shows empty state when no characters', async () => {
    const wrapper = mountPage([]);
    await flushPromises();
    await nextTick();

    const emptyState = wrapper.find('.empty-state');
    expect(emptyState.exists()).toBe(true);
    expect(emptyState.attributes('data-type')).toBe('no-data');
  });
});
