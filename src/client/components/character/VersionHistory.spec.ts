/**
 * VersionHistory component tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import i18n from '../../i18n';
import VersionHistory from './VersionHistory.vue';

// --- Mocks ---

const mockGetVersions = vi.fn();
const mockCompareVersions = vi.fn();

vi.mock('@client/services/character.api', () => ({
  characterApi: {
    getVersions: (...args: unknown[]) => mockGetVersions(...args),
    compareVersions: (...args: unknown[]) => mockCompareVersions(...args),
  },
}));

vi.mock('@client/composables/useDateTime', () => ({
  useDateTime: () => ({
    formatRelativeTime: (d: string) => `formatted:${d}`,
  }),
}));

const stubs = {
  VersionDiff: { template: '<div class="version-diff-stub" />' },
  'el-button': { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-skeleton': { template: '<div class="el-skeleton" />' },
  'el-timeline': { template: '<div class="el-timeline"><slot /></div>' },
  'el-timeline-item': { template: '<div class="el-timeline-item"><slot /></div>' },
  'el-checkbox': {
    template: '<input type="checkbox" class="el-checkbox" @change="$emit(\'change\')" />',
    props: ['modelValue', 'disabled'],
  },
  ArrowUp: { template: '<span class="arrow-up" />' },
  ArrowDown: { template: '<span class="arrow-down" />' },
};

const sampleVersions = [
  {
    id: 'v2',
    characterId: 'char-1',
    version: 2,
    cardData: { personality: 'Updated' },
    changeNote: 'Updated personality',
    createdBy: 'user1',
    createdAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'v1',
    characterId: 'char-1',
    version: 1,
    cardData: { personality: 'Original' },
    changeNote: null,
    createdBy: 'user1',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

function mountComponent(props = { characterId: 'char-1' }) {
  return mount(VersionHistory, {
    props,
    global: {
      plugins: [i18n],
      stubs,
    },
  });
}

describe('VersionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVersions.mockResolvedValue(sampleVersions);
  });

  it('renders toggle button', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    const toggleBtn = wrapper.find('.toggle-btn');
    expect(toggleBtn.exists()).toBe(true);
    expect(toggleBtn.text()).toContain('Version History');
  });

  it('shows version list when expanded and data loaded', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    // Initially the content is hidden via v-show (display: none)
    const content = wrapper.find('.version-content');
    expect(content.attributes('style')).toContain('display: none');

    // Set expanded state directly via VM
    const vm = wrapper.vm as any;
    vm.expanded = true;
    await flushPromises();

    // After expanding, display: none should be removed
    expect(content.attributes('style') || '').not.toContain('display: none');

    // Should show timeline items for each version
    const items = wrapper.findAll('.el-timeline-item');
    expect(items).toHaveLength(2);

    // Check version labels are rendered
    expect(wrapper.text()).toContain('Version');
    expect(wrapper.text()).toContain('Updated personality');
  });

  it('emits restore event when restore button clicked', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    // Expand
    await wrapper.find('.toggle-btn').trigger('click');
    await flushPromises();

    // Find restore buttons (type="warning" buttons inside timeline items)
    const restoreButtons = wrapper.findAll('.el-timeline-item button').filter(
      btn => btn.text().includes('Restore')
    );
    expect(restoreButtons.length).toBeGreaterThan(0);

    // Click the first restore button (version 2)
    await restoreButtons[0].trigger('click');

    // Should emit restore with the cardData of that version
    expect(wrapper.emitted('restore')).toBeTruthy();
    expect(wrapper.emitted('restore')![0]).toEqual([{ personality: 'Updated' }]);
  });
});
