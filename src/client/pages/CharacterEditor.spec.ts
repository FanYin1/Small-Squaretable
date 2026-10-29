/**
 * CharacterEditor round-trip bug tests
 *
 * Verifies that unknown cardData fields (alternate_greetings,
 * post_history_instructions, character_book, etc.) are preserved
 * through load -> edit -> save cycles.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import i18n from '../i18n';
import CharacterEditor from './CharacterEditor.vue';
import { collectPresentationSources, verifyPresentationSelection } from '../../server/services/story-presentation-workflow';

// --- Mocks ---

const mockPush = vi.fn();
const leaveGuards = vi.hoisted(() => ({ leave: vi.fn(), update: vi.fn() }));
const mockRoute = {
  params: { id: 'char-1' } as Record<string, string>,
  query: {} as Record<string, string>,
};

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
  onBeforeRouteLeave: (guard: unknown) => leaveGuards.leave(guard),
  onBeforeRouteUpdate: (guard: unknown) => leaveGuards.update(guard),
}));

const mockGetCharacter = vi.fn();
const mockUpdateCharacter = vi.fn();
const mockCreateCharacter = vi.fn();
const mockUserStore = reactive({ user: { id: 'author-1', tenantId: 'tenant-1' } });
vi.mock('@client/stores/user', () => ({ useUserStore: () => mockUserStore }));

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
  ExplorationLayout: { template: '<div><slot /><slot name="title" /></div>' },
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
    creatorId: 'author-1',
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

beforeEach(() => { sessionStorage.clear(); });

describe('Visual creator draft and preview workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.params = { id: 'char-1' };
    mockRoute.query = {};
    mockGetCharacter.mockResolvedValue(makeCharacter());
    mockUpdateCharacter.mockResolvedValue({ character: {} });
  });

  it('shows a derived introduction without dirtying the authored description and invalidates it when source fields change', async () => {
    const source = { ...makeCharacter({ first_mes: '你走进车站，售票员耐心等待你的问题。' }),
      id: 'ed30f3cc-15be-4ec0-912b-65f714e01220', description: '' };
    const sources = collectPresentationSources(source);
    const draft = verifyPresentationSelection(source, sources, { version: 1, candidateId: sources.candidates[0].id });
    mockGetCharacter.mockResolvedValue({ ...source, presentation: { id: '730474bd-d82d-473d-b7c6-e2c8810905c8', draft } });
    const wrapper = mountEditor();
    await flushPromises();
    expect(wrapper.get('[data-testid="editor-presentation"]').text()).toContain(draft.text);
    expect(wrapper.vm.form.description).toBe('');
    expect(wrapper.vm.dirty).toBe(false);
    wrapper.vm.form.firstMessage = '修改后的车站开场，等待另一位旅人。';
    await nextTick();
    expect(wrapper.find('[data-testid="editor-presentation"]').exists()).toBe(false);
    wrapper.vm.form.firstMessage = source.cardData.first_mes;
    await nextTick();
    expect(wrapper.find('[data-testid="editor-presentation"]').exists()).toBe(true);
    wrapper.vm.editPresentationIntroduction();
    await nextTick();
    expect(wrapper.vm.form.description).toBe(draft.text);
    expect(wrapper.vm.dirty).toBe(true);
    wrapper.unmount();
  });

  it('shares guided and advanced fields and previews the selected original scene', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    await wrapper.get('[data-testid="creator-name"]').setValue('New story');
    expect((wrapper.vm as any).form.name).toBe('New story');
    await wrapper.get('[data-step="openings"]').trigger('click');
    await wrapper.get('[data-scene="2"]').trigger('click');
    await wrapper.get('[data-testid="creator-scene-text"]').setValue('Last scene edited');
    const editor = wrapper.vm as any;
    expect(editor.form.firstMessage).toBe('Hello!');
    expect(editor.form.alternateGreetings).toEqual(['Hi there!', 'Last scene edited']);
    editor.advanced = true;
    await nextTick();
    await editor.handleSave();
    expect(mockUpdateCharacter.mock.calls[0][1].cardData.alternate_greetings).toEqual(['Hi there!', 'Last scene edited']);
    wrapper.unmount();
  });

  it('offers refresh recovery without replacing server data until explicitly restored', async () => {
    let wrapper = mountEditor();
    await flushPromises();
    (wrapper.vm as any).form.name = 'Local draft';
    (wrapper.vm as any).explorationDraft = '{ invalid original rules';
    await nextTick();
    wrapper.unmount();
    wrapper = mountEditor();
    await flushPromises();
    expect(wrapper.find('[data-testid="creator-recovery"]').exists()).toBe(true);
    const editor = wrapper.vm as any;
    expect(editor.form.name).toBe('Test Character');
    await editor.handleSave();
    expect(mockUpdateCharacter).not.toHaveBeenCalled();
    await editor.restoreLocalDraft();
    expect(editor.form.name).toBe('Local draft');
    expect(editor.explorationDraft).toBe('{ invalid original rules');
    expect(editor.originalCardData.extensions.custom_field).toBe('custom_value');
    expect(editor.dirty).toBe(true);
    wrapper.unmount();
  });

  it('warns when the server changed since the recovered draft baseline', async () => {
    let wrapper = mountEditor();
    await flushPromises();
    (wrapper.vm as any).form.name = 'Local draft';
    await nextTick();
    wrapper.unmount();
    mockGetCharacter.mockResolvedValue({ ...makeCharacter(), description: 'New server description' });
    wrapper = mountEditor();
    await flushPromises();
    expect(wrapper.get('[data-testid="creator-recovery"]').text()).toContain('服务器内容已变化');
    (wrapper.vm as any).localDraft.clear();
    expect((wrapper.vm as any).form.description).toBe('New server description');
    expect(sessionStorage.length).toBe(0);
    wrapper.unmount();
  });

  it('preserves uncertain creation across refresh and does not send a duplicate create', async () => {
    mockRoute.params = {};
    mockCreateCharacter.mockRejectedValue(new Error('lost receipt'));
    let wrapper = mountEditor();
    await flushPromises();
    (wrapper.vm as any).form.name = 'New private work';
    await (wrapper.vm as any).handleSave();
    await nextTick();
    wrapper.unmount();
    wrapper = mountEditor();
    await flushPromises();
    await (wrapper.vm as any).restoreLocalDraft();
    expect((wrapper.vm as any).saveUncertain).toBe(true);
    await (wrapper.vm as any).handleSave();
    expect(mockCreateCharacter).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

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

describe('CharacterEditor Page UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.params = {};
    mockRoute.query = {};
  });

  it('should render editor container', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    expect(wrapper.find('.editor-container').exists()).toBe(true);
  });

  it('should show form fields including name input', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    expect(wrapper.find('.editor-form').exists()).toBe(true);
    // Form should contain input elements for the character fields
    const inputs = wrapper.findAll('input');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('should have save/create button in form actions', async () => {
    const wrapper = mountEditor();
    await flushPromises();

    const actions = wrapper.find('.form-actions');
    expect(actions.exists()).toBe(true);

    const buttons = actions.findAll('button');
    // At least Cancel + Create buttons
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});

describe('CharacterEditor persistence boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserStore.user = { id: 'author-1', tenantId: 'tenant-1' };
    mockRoute.params = { id: 'char-1' };
    mockRoute.query = {};
    mockGetCharacter.mockResolvedValue(makeCharacter());
    mockUpdateCharacter.mockResolvedValue({});
  });

  it('retains template voice settings and unknown extensions when saving from the workbench', async () => {
    const { characterTemplateApi } = await import('@client/services/character-template.api');
    mockRoute.params = {};
    mockRoute.query = { templateId: 'template-1' };
    const extensions = { voice: { voice: 'template-voice' }, custom: { untouched: true } };
    vi.mocked(characterTemplateApi.useTemplate).mockResolvedValueOnce({ name: 'Template', cardData: { name: 'Template story', first_mes: 'Opening', extensions } } as any);
    const wrapper = mountEditor();
    await flushPromises();
    await (wrapper.vm as any).handleSave();
    expect(mockCreateCharacter.mock.lastCall![0].cardData.extensions).toMatchObject(extensions);
    wrapper.unmount();
  });

  it('isolates an unsaved draft and ignores a late save result after account switching', async () => {
    let complete!: (value: unknown) => void;
    mockUpdateCharacter.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const wrapper = mountEditor();
    await flushPromises();
    const editor = wrapper.vm as any;
    editor.form.name = 'Account one draft';
    await nextTick();
    const save = editor.handleSave();
    await flushPromises();
    mockUserStore.user = { id: 'author-2', tenantId: 'tenant-2' };
    await flushPromises();
    expect(editor.form.name).toBe('Test Character');
    expect(wrapper.find('[data-testid="creator-recovery"]').exists()).toBe(false);
    complete({});
    await save;
    expect(mockPush).not.toHaveBeenCalled();
    mockUserStore.user = { id: 'author-1', tenantId: 'tenant-1' };
    await flushPromises();
    expect(wrapper.find('[data-testid="creator-recovery"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('sends explicit empty metadata so clearing fields survives a server reload', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    const editor = wrapper.vm as any;
    editor.form.description = '';
    editor.form.category = '';
    editor.form.tags = [];
    await editor.handleSave();
    expect(mockUpdateCharacter.mock.calls[0][1]).toMatchObject({ description: '', category: '', tags: [] });
    wrapper.unmount();
  });

  it('does not expose author-only tools to a non-owner', async () => {
    mockGetCharacter.mockResolvedValueOnce({ ...makeCharacter(), creatorId: 'another-author' });
    const wrapper = mountEditor();
    await flushPromises();
    expect((wrapper.vm as any).isOwner).toBe(false);
    expect(wrapper.findComponent({ name: 'CharacterWorldbookBindings' }).exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps unsaved edits on failed save and supports canceling navigation', async () => {
    const { ElMessageBox } = await import('element-plus');
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel');
    const wrapper = mountEditor();
    await flushPromises();
    const editor = wrapper.vm as any;
    editor.form.name = 'Unsaved name';
    mockUpdateCharacter.mockRejectedValueOnce(new Error('offline'));
    await editor.handleSave();
    expect(await leaveGuards.leave.mock.calls.at(-1)![0]()).toBe(false);
    expect(editor.form.name).toBe('Unsaved name');
    expect(mockPush).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="editor-save-status"]').text()).toContain('could not be confirmed');
    wrapper.unmount();
  });

  it('blocks concurrent saves before async validation finishes', async () => {
    const wrapper = mountEditor();
    await flushPromises();
    const editor = wrapper.vm as any;
    let validate!: () => void;
    editor.formRef = { validate: () => new Promise<void>(resolve => { validate = resolve; }) };
    const first = editor.handleSave();
    await editor.handleSave();
    validate();
    await first;
    expect(mockUpdateCharacter).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('does not resend an unconfirmed creation when the response is lost', async () => {
    mockRoute.params = {};
    mockCreateCharacter.mockRejectedValueOnce(new Error('response lost'));
    const wrapper = mountEditor();
    await flushPromises();
    const editor = wrapper.vm as any;
    editor.form.name = 'New creation';
    await editor.handleSave();
    await editor.handleSave();
    expect(mockCreateCharacter).toHaveBeenCalledTimes(1);
    expect(editor.saveUncertain).toBe(true);
    expect(editor.form.name).toBe('New creation');
    wrapper.unmount();
  });

  it('replaces optional greetings and extensions when selecting an older version', async () => {
    const { ElMessageBox } = await import('element-plus');
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm');
    const wrapper = mountEditor();
    await flushPromises();
    const editor = wrapper.vm as any;
    editor.voiceConfig = { voice: 'old' };
    editor.expressionConfig = { neutral: 'old.png' };
    await editor.handleRestoreVersion({ personality: 'Earlier personality' });
    expect(editor.form.alternateGreetings).toEqual([]);
    expect(editor.expressionConfig).toEqual({});
    expect(editor.voiceConfig).toEqual({});
    expect(mockUpdateCharacter).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('offers a retry and prevents saving a failed load as an empty replacement', async () => {
    mockGetCharacter.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mountEditor();
    await flushPromises();
    await (wrapper.vm as any).handleSave();
    expect(mockUpdateCharacter).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="editor-save-status"]').text()).toContain('load');
    await (wrapper.vm as any).initializeEditor();
    expect((wrapper.vm as any).form.name).toBe('Test Character');
    wrapper.unmount();
  });
});
