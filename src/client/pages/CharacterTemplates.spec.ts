import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import CharacterTemplates from './CharacterTemplates.vue';

const mockGetMyTemplates = vi.fn();
const mockDeleteTemplate = vi.fn();
const mockListTemplates = vi.fn();
const mockGetTemplateRating = vi.fn();
const mockRateTemplate = vi.fn();

vi.mock('@client/services/character-template.api', () => ({
  characterTemplateApi: {
    listTemplates: (...args: unknown[]) => mockListTemplates(...args),
    getMyTemplates: (...args: unknown[]) => mockGetMyTemplates(...args),
    deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    useTemplate: vi.fn(),
    rateTemplate: (...args: unknown[]) => mockRateTemplate(...args),
    getTemplateRating: (...args: unknown[]) => mockGetTemplateRating(...args),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@client/components/layout/DashboardLayout.vue', () => ({
  default: {
    name: 'DashboardLayout',
    template: '<div class="mock-layout"><slot /><slot name="title" /></div>',
  },
}));

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  };
});

const enUS = {
  common: { edit: 'Edit', delete: 'Delete', cancel: 'Cancel', save: 'Save', confirm: 'Confirm', name: 'Name', description: 'Description', category: 'Category', public: 'Public' },
  characterTemplates: {
    title: 'Character Templates',
    useTemplate: 'Use Template',
    createFromTemplate: 'Create from Template',
    allCategories: 'All Categories',
    usageCount: 'Used {count} times',
    noTemplates: 'No templates available',
    rating: 'Rating',
    rateTemplate: 'Rate',
    ratingSuccess: 'Rating submitted',
    myTemplates: 'My Templates',
    browse: 'Browse',
    editTemplate: 'Edit Template',
    deleteConfirm: 'Delete this template?',
    deleteSuccess: 'Template deleted',
    updateSuccess: 'Template updated',
    noMyTemplates: "You haven't created any templates yet",
  },
};

const sampleMyTemplates = [
  {
    id: 'tpl-1',
    name: 'My Template',
    description: 'A test template',
    avatarUrl: '',
    cardData: {},
    category: 'assistant',
    tags: ['test'],
    isPublic: true,
    usageCount: 5,
    creatorId: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'tpl-2',
    name: 'Second Template',
    description: 'Another template',
    avatarUrl: '',
    cardData: {},
    category: 'roleplay',
    tags: [],
    isPublic: false,
    usageCount: 2,
    creatorId: 'user-1',
    createdAt: '2026-01-02T00:00:00Z',
  },
];

function createWrapper() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: { 'en-US': enUS },
  });

  mockListTemplates.mockResolvedValue({ items: [], pagination: { total: 0 } });
  mockGetTemplateRating.mockResolvedValue({ average: 0, count: 0 });

  return mount(CharacterTemplates, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        ElTabs: { template: '<div class="el-tabs"><slot /></div>', props: ['modelValue'], emits: ['update:modelValue', 'tab-change'] },
        ElTabPane: { template: '<div class="el-tab-pane" :data-name="name"><slot /></div>', props: ['label', 'name'] },
        ElButton: { template: '<button :class="type ? `el-button--${type}` : \'\'" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'disabled'], emits: ['click'] },
        ElSkeleton: { template: '<div class="el-skeleton" />' },
        ElEmpty: { template: '<div class="el-empty">{{ description }}</div>', props: ['description'] },
        ElCard: { template: '<div class="el-card template-card"><slot /></div>', props: ['shadow'] },
        ElAvatar: { template: '<span class="el-avatar"><slot /></span>', props: ['src', 'size'] },
        ElTag: { template: '<span class="el-tag"><slot /></span>', props: ['size'] },
        ElRadioGroup: { template: '<div><slot /></div>', props: ['modelValue'] },
        ElRadioButton: { template: '<label><slot /></label>', props: ['value'] },
        ElPagination: { template: '<div class="el-pagination" />', props: ['currentPage', 'pageSize', 'total', 'layout'] },
        ElDialog: { template: '<div class="el-dialog" v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue', 'title', 'width'] },
        ElForm: { template: '<form><slot /></form>', props: ['labelPosition'] },
        ElFormItem: { template: '<div class="el-form-item"><slot /></div>', props: ['label'] },
        ElInput: { template: '<input />', props: ['modelValue', 'type', 'rows'] },
        ElSwitch: { template: '<input type="checkbox" />', props: ['modelValue', 'activeText'] },
        ElRate: { template: '<div class="el-rate" />', props: ['modelValue', 'max'] },
      },
    },
  });
}

describe('CharacterTemplates Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('My Templates tab shows user templates', async () => {
    mockGetMyTemplates.mockResolvedValue(sampleMyTemplates);

    const wrapper = createWrapper();
    await flushPromises();

    // Simulate switching to "mine" tab
    wrapper.vm.activeTab = 'mine';
    await wrapper.vm.loadMyTemplates();
    await nextTick();

    const minePane = wrapper.findAll('.el-tab-pane').find(
      (el) => el.attributes('data-name') === 'mine',
    );
    expect(minePane).toBeDefined();

    // Check that myTemplates were loaded
    expect(mockGetMyTemplates).toHaveBeenCalled();
    expect(wrapper.vm.myTemplates).toHaveLength(2);
    expect(wrapper.vm.myTemplates[0].name).toBe('My Template');
  });

  it('Delete template removes from list', async () => {
    mockGetMyTemplates.mockResolvedValue([...sampleMyTemplates]);
    mockDeleteTemplate.mockResolvedValue({});

    const wrapper = createWrapper();
    await flushPromises();

    // Load my templates
    wrapper.vm.activeTab = 'mine';
    await wrapper.vm.loadMyTemplates();
    await nextTick();

    expect(wrapper.vm.myTemplates).toHaveLength(2);

    // Delete the first template
    await wrapper.vm.deleteTemplate('tpl-1');
    await nextTick();

    expect(mockDeleteTemplate).toHaveBeenCalledWith('tpl-1');
    expect(wrapper.vm.myTemplates).toHaveLength(1);
    expect(wrapper.vm.myTemplates[0].id).toBe('tpl-2');
  });
});
