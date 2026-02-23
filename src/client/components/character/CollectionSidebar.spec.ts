import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import CollectionSidebar from './CollectionSidebar.vue';
import type { CharacterCollection } from '@client/types';

vi.mock('@client/services/character-collection.api', () => ({
  characterCollectionApi: {
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
  },
}));

vi.mock('@client/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn(),
    prompt: vi.fn(),
  },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      collections: { title: 'Collections', all: 'All', create: 'Create', rename: 'Rename', delete: 'Delete', deleteConfirm: 'Delete?', changeColor: 'Color' },
      common: { name: 'Name', confirm: 'Confirm', cancel: 'Cancel', createSuccess: 'Created', createFailed: 'Failed', updateSuccess: 'Updated', updateFailed: 'Failed', deleteSuccess: 'Deleted', deleteFailed: 'Failed', retry: 'Retry' },
    },
  },
});

const stubs = {
  'el-button': { template: '<button><slot /></button>', props: ['icon', 'size', 'type', 'text', 'disabled'] },
  'el-icon': { template: '<span><slot /></span>' },
  'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width'] },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>', props: ['label'] },
  'el-input': { template: '<input />', props: ['modelValue', 'maxlength', 'placeholder'] },
  'el-color-picker': { template: '<div />', props: ['modelValue'] },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>', props: ['trigger', 'size'] },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>', props: ['command', 'divided'] },
};

const mockCollections: CharacterCollection[] = [
  { id: 'col-1', name: 'Favorites', color: '#ff0000', sortOrder: 0, itemCount: 5, createdAt: '2026-01-01' },
  { id: 'col-2', name: 'Work', color: '#00ff00', sortOrder: 1, itemCount: 3, createdAt: '2026-01-02' },
];

describe('CollectionSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders collection list with names', () => {
    const wrapper = mount(CollectionSidebar, {
      props: { activeCollection: null, collections: mockCollections },
      global: { plugins: [i18n], stubs },
    });

    const items = wrapper.findAll('.collection-item');
    // First item is "All", then one per collection
    expect(items.length).toBe(3);
    expect(items[0].text()).toContain('All');
    expect(wrapper.text()).toContain('Favorites');
    expect(wrapper.text()).toContain('Work');
  });

  it('emits select with null when "All" is clicked', async () => {
    const wrapper = mount(CollectionSidebar, {
      props: { activeCollection: 'col-1', collections: mockCollections },
      global: { plugins: [i18n], stubs },
    });

    const allItem = wrapper.findAll('.collection-item')[0];
    await allItem.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual([null]);
  });

  it('emits select with collection ID when a collection is clicked', async () => {
    const wrapper = mount(CollectionSidebar, {
      props: { activeCollection: null, collections: mockCollections },
      global: { plugins: [i18n], stubs },
    });

    // Click the second collection item (index 2 = "Work", index 1 = "Favorites")
    const collectionItems = wrapper.findAll('.collection-item');
    await collectionItems[1].trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['col-1']);
  });
});
