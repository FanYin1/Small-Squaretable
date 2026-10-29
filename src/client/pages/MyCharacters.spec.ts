/**
 * MyCharacters page tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import i18n from '../i18n';
import MyCharacters from './MyCharacters.vue';
import { characterCollectionApi } from '@client/services/character-collection.api';

// --- Mocks ---

const mockPush = vi.fn();
const mockHasFeature = vi.fn(() => true);

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
const mockBatchImport = vi.fn();
const mockToastSuccess = vi.fn();

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
    batchImportCharacters: (...args: unknown[]) => mockBatchImport(...args),
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
    hasFeature: () => mockHasFeature(),
    currentPlan: { value: 'pro' },
  }),
}));

vi.mock('@client/composables/useToast', () => ({
  useToast: () => ({
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@client/utils/sillytavern', async () => ({
  ...await vi.importActual<Record<string, unknown>>('@client/utils/sillytavern'),
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
  ExplorationLayout: {
    template: '<div class="dashboard-layout"><slot name="title" /><slot name="center" /><slot name="actions" /><slot /></div>',
  },
  CollectionSidebar: { template: '<div class="collection-sidebar" />' },
  EmptyState: {
    template: '<div class="empty-state" :data-type="type"><slot /></div>',
    props: ['type'],
  },
  CharacterPublishForm: { name: 'CharacterPublishForm', props: ['visible', 'character'], template: '<div />' },
  // 渲染成 data-* 才能断言透传的字段：声明了 props 的 stub 会把绑定吃掉，
  // 属性不会出现在 DOM 里
  ModerationStatusBadge: {
    template: '<span class="moderation-badge" :data-status="status" :data-note="note" :data-category="category" />',
    props: ['status', 'note', 'category'],
  },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-button': { emits: ['click'], template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>' },
  'el-tabs': { template: '<div class="el-tabs"><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div class="el-tab-pane"><slot /><slot name="label" /></div>', props: ['name'] },
  'el-checkbox': { template: '<input type="checkbox" />', props: ['modelValue'] },
  'el-dialog': { template: '<div v-if="$attrs.modelValue"><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { template: '<select><slot /></select>' },
  'el-icon': { template: '<i />' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<ul><slot /></ul>' },
  'el-dropdown-item': { template: '<li><slot /></li>' },
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
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasFeature.mockReturnValue(true);
  });

  it('opens local publication preview without entitlement or a write request', async () => {
    mockHasFeature.mockReturnValue(false);
    const wrapper = mountPage();
    await flushPromises();
    wrapper.findComponent({ name: 'PrivateStoryCard' }).vm.$emit('manage', 'publish');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'CharacterPublishForm' }).props('visible')).toBe(true);
    expect(mockApiPost).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('starts an imported card through the same quick-entry contract as discovery', async () => {
    mockGetCharacters.mockResolvedValueOnce({ characters: sampleCharacters, pagination: { hasNext: false } });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.findAll('.private-story-enter')[0].trigger('click');
    expect(mockPush).toHaveBeenCalledWith({ name: 'Chat', query: { characterId: '1', storyEntry: 'quick' } });
    wrapper.unmount();
  });

  it('offers remaining pages without pretending the first page is the full collection', async () => {
    mockGetCharacters.mockResolvedValueOnce({ characters: [sampleCharacters[0]], pagination: { hasNext: true } });
    const wrapper = mountPage();
    await flushPromises();
    expect((wrapper.vm as any).nextPage).toBe(2);
    expect(wrapper.text()).toContain(i18n.global.t('myCharacters.partialList'));
    mockGetCharacters.mockResolvedValueOnce({ characters: [sampleCharacters[1]], pagination: { hasNext: false } });
    await (wrapper.vm as any).fetchCharacters(true);
    expect(mockGetCharacters).toHaveBeenLastCalledWith({ page: 2, limit: 50 }, { signal: expect.any(AbortSignal) });
    expect((wrapper.vm as any).characters).toHaveLength(2);
    expect((wrapper.vm as any).nextPage).toBeNull();
    wrapper.unmount();
  });

  it('shows a load error rather than the create-your-first-work empty state', async () => {
    mockGetCharacters.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false);
    await (wrapper.vm as any).fetchCharacters();
    expect((wrapper.vm as any).loadFailed).toBe(false);
    wrapper.unmount();
  });

  it('does not let an older list response overwrite the latest request', async () => {
    let finish!: (result: object) => void;
    mockGetCharacters.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = mountPage();
    await (wrapper.vm as any).fetchCharacters();
    finish({ characters: [{ ...sampleCharacters[0], id: 'obsolete' }] });
    await flushPromises();
    expect((wrapper.vm as any).characters.map((item: { id: string }) => item.id)).not.toContain('obsolete');
    wrapper.unmount();
  });

  it('ends a hanging first-page read after 15 seconds and retries only on user action', async () => {
    vi.useFakeTimers();
    let finish!: (result: object) => void;
    mockGetCharacters.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const wrapper = mountPage();
    await flushPromises();
    const signal = mockGetCharacters.mock.calls[0][1].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(15000);
    await nextTick();
    expect(signal.aborted).toBe(true);
    expect((wrapper.vm as any).loading).toBe(false);
    expect(wrapper.get('[data-testid="library-load-error"]').text()).toContain(i18n.global.t('myCharacters.loadListTimedOut'));
    expect(wrapper.get('[data-testid="library-load-error"] button').text()).toBe(i18n.global.t('myCharacters.retryLoad'));
    expect(wrapper.find('.empty-state').exists()).toBe(false);
    expect(mockGetCharacters).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-testid="library-load-error"] button').trigger('click');
    await flushPromises();
    expect(mockGetCharacters).toHaveBeenCalledTimes(2);
    expect(mockGetCharacters.mock.calls[1][0]).toEqual({ page: 1, limit: 50 });
    finish({ characters: [{ ...sampleCharacters[0], id: 'late-timeout' }] });
    await flushPromises();
    expect((wrapper.vm as any).characters).toEqual(sampleCharacters);
    expect(wrapper.find('[data-testid="library-load-error"]').exists()).toBe(false);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps loaded cards on page timeout and retries that same remaining page', async () => {
    vi.useFakeTimers();
    mockGetCharacters.mockResolvedValueOnce({ characters: [sampleCharacters[0]], pagination: { hasNext: true } });
    const wrapper = mountPage();
    await flushPromises();
    mockGetCharacters.mockReturnValueOnce(new Promise(() => {}));
    const pending = (wrapper.vm as any).fetchCharacters(true);
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
    expect((wrapper.vm as any).characters).toEqual([sampleCharacters[0]]);
    expect((wrapper.vm as any).nextPage).toBe(2);
    mockGetCharacters.mockResolvedValueOnce({ characters: [sampleCharacters[1]], pagination: { hasNext: false } });
    await wrapper.get('[data-testid="library-load-error"] button').trigger('click');
    await flushPromises();
    expect(mockGetCharacters.mock.calls.at(-1)[0]).toEqual({ page: 2, limit: 50 });
    expect((wrapper.vm as any).characters).toEqual(sampleCharacters);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels superseded and unmounted reads without late errors or loading state changes', async () => {
    vi.useFakeTimers();
    mockGetCharacters.mockReturnValueOnce(new Promise(() => {}));
    const wrapper = mountPage();
    const firstSignal = mockGetCharacters.mock.calls[0][1].signal as AbortSignal;
    await (wrapper.vm as any).fetchCharacters();
    expect(firstSignal.aborted).toBe(true);
    expect((wrapper.vm as any).loadFailed).toBe(false);
    mockGetCharacters.mockReturnValueOnce(new Promise(() => {}));
    const pending = (wrapper.vm as any).fetchCharacters();
    const lastSignal = mockGetCharacters.mock.calls.at(-1)[1].signal as AbortSignal;
    wrapper.unmount();
    await pending;
    expect(lastSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applies the same deadline to collection reads and clears the old collection on switching', async () => {
    vi.useFakeTimers();
    const wrapper = mountPage();
    await flushPromises();
    vi.mocked(characterCollectionApi.getCollectionCharacters).mockReturnValueOnce(new Promise(() => {}));
    (wrapper.vm as any).handleCollectionSelect('collection-one');
    const signal = vi.mocked(characterCollectionApi.getCollectionCharacters).mock.calls.at(-1)![1]!.signal!;
    await vi.advanceTimersByTimeAsync(15000);
    expect(signal.aborted).toBe(true);
    expect((wrapper.vm as any).loadTimedOut).toBe(true);
    (wrapper.vm as any).handleCollectionSelect(null);
    await flushPromises();
    expect((wrapper.vm as any).characters).toEqual(sampleCharacters);
    expect((wrapper.vm as any).loadFailed).toBe(false);
    wrapper.unmount();
  });

  it.each([0, 1])('retains per-file failures with %s imported characters and does not report all-success', async count => {
    const wrapper = mountPage();
    await flushPromises();
    mockBatchImport.mockResolvedValue({
      imported: count ? [{ id: 'new', name: 'New card' }] : [],
      failed: [{ filename: 'broken.png', code: 'INVALID_METADATA', error: 'Invalid metadata' }],
      total: count + 1,
    });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['bad'], 'broken.png')] });
    await input.trigger('change');
    await flushPromises();
    const result = wrapper.get('[data-testid="import-result"]');
    expect(result.text()).toContain('broken.png');
    expect(result.text()).toContain(i18n.global.t('myCharacters.importErrors.INVALID_METADATA'));
    expect(result.text()).toContain(i18n.global.t('myCharacters.batchImportResult', { imported: count, failed: 1 }));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockGetCharacters).toHaveBeenCalledTimes(count + 1);
    await result.get('button').trigger('click');
    expect(wrapper.find('[data-testid="import-result"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('reports a numeric count when every file succeeds', async () => {
    const wrapper = mountPage();
    await flushPromises();
    mockBatchImport.mockResolvedValue({ imported: [{ id: 'new', name: 'New card' }], failed: [], total: 1 });
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['{}'], 'card.json')] });
    await input.trigger('change');
    await flushPromises();
    expect(mockToastSuccess).toHaveBeenCalledWith(i18n.global.t('myCharacters.batchImportSuccess', { count: 1 }));
    wrapper.unmount();
  });

  it('renders character cards when data exists', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await nextTick();

    const cards = wrapper.findAll('.private-story-card');
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

    const emptyState = wrapper.find('.library-empty');
    expect(emptyState.exists()).toBe(true);
    expect(emptyState.attributes('data-type')).toBe('no-data');
  });

  /**
   * 「已发布」这一个标签分不清在审、被驳回、已上线三种状态。发布后角色是
   * pending，公开入口要求 approved，所以作者会以为上线了、实际还在排队。
   */
  describe('审核状态', () => {
    const published = (moderationStatus: string, extra: Record<string, unknown> = {}) => [{
      ...sampleCharacters[0],
      isPublic: true,
      moderationStatus,
      ...extra,
    }];

    it('待审核的角色带上状态徽标', async () => {
      const wrapper = mountPage(published('pending'));
      await flushPromises();
      await nextTick();
      wrapper.vm.activeTab = 'published';
      await nextTick();

      const badge = wrapper.find('.moderation-badge');
      expect(badge.exists()).toBe(true);
      expect(badge.attributes('data-status')).toBe('pending');
    });

    it('驳回理由传给徽标，作者才知道改什么', async () => {
      const wrapper = mountPage(published('rejected', { moderationNote: '过度暴力描写' }));
      await flushPromises();
      await nextTick();
      wrapper.vm.activeTab = 'published';
      await nextTick();

      expect(wrapper.find('.moderation-badge').attributes('data-note')).toBe('过度暴力描写');
    });

    // 私有 tab 里的角色都是 draft，挂徽标只是噪音
    it('未发布的角色不显示徽标', async () => {
      const wrapper = mountPage();
      await flushPromises();
      await nextTick();

      expect(wrapper.find('.moderation-badge').exists()).toBe(false);
    });
  });
});
