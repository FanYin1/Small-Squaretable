/**
 * CharacterEditor round-trip bug tests
 *
 * Verifies that unknown cardData fields (alternate_greetings,
 * post_history_instructions, character_book, etc.) are preserved
 * through load -> edit -> save cycles.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import i18n from '../i18n';
import CharacterEditor from './CharacterEditor.vue';

// --- Mocks ---

const mockPush = vi.fn();
const mockRoute = {
  params: { id: 'char-1' } as Record<string, string>,
  query: {} as Record<string, string>,
};

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}));

const mockGetCharacter = vi.fn();
const mockUpdateCharacter = vi.fn();
const mockCreateCharacter = vi.fn();

vi.mock('@client/services/character.api', () => ({
  characterApi: {
    getCharacter: (...args: unknown[]) => mockGetCharacter(...args),
    updateCharacter: (...args: unknown[]) => mockUpdateCharacter(...args),
    createCharacter: (...args: unknown[]) => mockCreateCharacter(...args),
  },
}));

const mockCreateTemplate = vi.fn();

vi.mock('@client/services/character-template.api', () => ({
  characterTemplateApi: {
    useTemplate: vi.fn(),
    createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  },
}));

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}));
// PLACEHOLDER_STUBS

const stubs = {
  DashboardLayout: { template: '<div><slot /><slot name="title" /></div>' },
  CharacterPreview: { template: '<div />' },
  VersionHistory: { template: '<div />' },
  TemplateSelector: { template: '<div />' },
  VoiceSettings: { template: '<div />' },
  ExpressionEditor: { template: '<div />' },
  CollaboratorPanel: { template: '<div />' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-form': {
    template: '<form><slot /></form>',
    methods: { validate: () => Promise.resolve(true) },
  },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-select': { template: '<select><slot /></select>' },
  'el-option': { template: '<option />' },
  'el-switch': { template: '<input type="checkbox" />' },
  'el-divider': { template: '<hr />' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-dialog': { template: '<div v-if="$attrs.modelValue"><slot /><slot name="footer" /></div>', inheritAttrs: true },
  ArrowUp: { template: '<span />' },
  ArrowDown: { template: '<span />' },
};

function makeCharacter(cardDataOverrides: Record<string, unknown> = {}) {
  return {
    id: 'char-1',
    name: 'Test Character',
    description: 'A test character',
    avatar: '',
    tags: ['test'],
    category: 'assistant',
    isPublic: true,
    isNsfw: false,
    createdAt: '2026-01-01T00:00:00Z',
    cardData: {
      personality: 'Friendly',
      scenario: 'A test scenario',
      first_mes: 'Hello!',
      mes_example: '',
      system_prompt: 'You are a test bot.',
      creator_notes: 'Test notes',
      alternate_greetings: ['Hi there!', 'Hey!'],
      post_history_instructions: 'Always be polite.',
      character_book: { entries: [{ keyword: 'test', content: 'info' }] },
      creator: 'TestCreator',
      character_version: '1.2.0',
      extensions: { custom_field: 'custom_value' },
      ...cardDataOverrides,
    },
  };
}

function mountEditor() {
  return mount(CharacterEditor, {
    global: {
      plugins: [i18n],
      stubs,
    },
  });
}

describe('CharacterEditor cardData round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.params = { id: 'char-1' };
    mockRoute.query = {};
    mockUpdateCharacter.mockResolvedValue({ character: {} });
  });

  it('should preserve alternate_greetings from original cardData on save', async () => {
    const character = makeCharacter();
    mockGetCharacter.mockResolvedValue(character);

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    // Verify the character was loaded
    expect(mockGetCharacter).toHaveBeenCalledWith('char-1');

    const vm = wrapper.vm as any;

    // Trigger save — mock formRef.validate to resolve
    vm.formRef = { validate: () => Promise.resolve(true) };
    await vm.handleSave();
    await flushPromises();

    expect(mockUpdateCharacter).toHaveBeenCalledTimes(1);
    const updateArgs = mockUpdateCharacter.mock.calls[0];
    const savedCardData = updateArgs[1].cardData;

    expect(savedCardData.alternate_greetings).toEqual(['Hi there!', 'Hey!']);
    expect(savedCardData.creator).toBe('TestCreator');
    expect(savedCardData.character_version).toBe('1.2.0');
    expect(savedCardData.character_book).toEqual({ entries: [{ keyword: 'test', content: 'info' }] });
  });

  it('should preserve post_history_instructions from original cardData on save', async () => {
    const character = makeCharacter();
    mockGetCharacter.mockResolvedValue(character);

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    const vm = wrapper.vm as any;
    vm.formRef = { validate: () => Promise.resolve(true) };
    await vm.handleSave();
    await flushPromises();

    expect(mockUpdateCharacter).toHaveBeenCalledTimes(1);
    const savedCardData = mockUpdateCharacter.mock.calls[0][1].cardData;

    expect(savedCardData.post_history_instructions).toBe('Always be polite.');
    // Also verify extensions are merged, not replaced
    expect(savedCardData.extensions.custom_field).toBe('custom_value');
    expect(savedCardData.extensions.voice).toBeDefined();
  });

  it('should load alternate_greetings from character cardData into form', async () => {
    const character = makeCharacter();
    mockGetCharacter.mockResolvedValue(character);

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    const vm = wrapper.vm as any;
    expect(vm.form.alternateGreetings).toEqual(['Hi there!', 'Hey!']);
  });

  it('should include edited alternate_greetings in save payload', async () => {
    const character = makeCharacter();
    mockGetCharacter.mockResolvedValue(character);

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    const vm = wrapper.vm as any;

    // Modify the alternate greetings
    vm.form.alternateGreetings = ['Hello world!', 'Greetings!', 'Howdy!'];

    vm.formRef = { validate: () => Promise.resolve(true) };
    await vm.handleSave();
    await flushPromises();

    expect(mockUpdateCharacter).toHaveBeenCalledTimes(1);
    const savedCardData = mockUpdateCharacter.mock.calls[0][1].cardData;
    expect(savedCardData.alternate_greetings).toEqual(['Hello world!', 'Greetings!', 'Howdy!']);
  });

  it('should load expressions from character cardData into expressionConfig', async () => {
    const character = makeCharacter({
      extensions: {
        custom_field: 'custom_value',
        expressions: { neutral: 'data:image/png;base64,neutral', happy: 'data:image/png;base64,happy' },
      },
    });
    mockGetCharacter.mockResolvedValue(character);

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    const vm = wrapper.vm as any;
    expect(vm.expressionConfig).toEqual({ neutral: 'data:image/png;base64,neutral', happy: 'data:image/png;base64,happy' });
    expect(vm.showExpressionEditor).toBe(true);
  });

  it('should include expressions in save payload under extensions.expressions', async () => {
    const character = makeCharacter();
    mockGetCharacter.mockResolvedValue(character);

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    const vm = wrapper.vm as any;
    vm.expressionConfig = { neutral: 'data:image/png;base64,n', sad: 'data:image/png;base64,s' };

    vm.formRef = { validate: () => Promise.resolve(true) };
    await vm.handleSave();
    await flushPromises();

    expect(mockUpdateCharacter).toHaveBeenCalledTimes(1);
    const savedCardData = mockUpdateCharacter.mock.calls[0][1].cardData;
    expect(savedCardData.extensions.expressions).toEqual({ neutral: 'data:image/png;base64,n', sad: 'data:image/png;base64,s' });
  });
});

describe('CharacterEditor Save as Template', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.params = { id: 'char-1' };
    mockRoute.query = {};
    mockCreateTemplate.mockResolvedValue({});
  });

  it('should show Save as Template button only in edit mode for owner', async () => {
    const character = makeCharacter();
    mockGetCharacter.mockResolvedValue(character);

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    const buttons = wrapper.findAll('button');
    const templateBtn = buttons.find(b => b.text().includes('Save as Template'));
    expect(templateBtn).toBeDefined();
  });

  it('should not show Save as Template button in create mode', async () => {
    mockRoute.params = {};

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    const buttons = wrapper.findAll('button');
    const templateBtn = buttons.find(b => b.text().includes('Save as Template'));
    expect(templateBtn).toBeUndefined();
  });

  it('should call createTemplate with correct data when confirmed', async () => {
    const character = makeCharacter();
    mockGetCharacter.mockResolvedValue(character);

    const wrapper = mountEditor();
    await flushPromises();
    await nextTick();

    const vm = wrapper.vm as any;
    await vm.handleSaveAsTemplate();
    await flushPromises();

    expect(mockCreateTemplate).toHaveBeenCalledTimes(1);
    const args = mockCreateTemplate.mock.calls[0][0];
    expect(args.name).toBe('Test Character');
    expect(args.category).toBe('assistant');
    expect(args.tags).toEqual(['test']);
  });
});
