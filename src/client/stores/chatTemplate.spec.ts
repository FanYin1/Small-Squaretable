import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatTemplateStore } from './chatTemplate';
import { chatTemplateApi, type ChatTemplate } from '@client/services/chat-template.api';

vi.mock('@client/services/chat-template.api', () => ({
  chatTemplateApi: {
    getTemplates: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    useTemplate: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const makeTemplate = (overrides: Partial<ChatTemplate> = {}): ChatTemplate => ({
  id: 'tpl-1',
  userId: 'user-1',
  name: 'Test Template',
  description: 'A test template',
  systemPrompt: 'You are helpful.',
  firstMessage: 'Hello!',
  tags: ['test'],
  isPublic: false,
  usageCount: 0,
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

describe('ChatTemplate Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 1. fetchTemplates populates ownTemplates and publicTemplates
  it('should populate ownTemplates and publicTemplates on fetch', async () => {
    const own = [makeTemplate({ id: 'tpl-own' })];
    const pub = [makeTemplate({ id: 'tpl-pub', isPublic: true })];
    vi.mocked(chatTemplateApi.getTemplates).mockResolvedValue({ own, public: pub });

    const store = useChatTemplateStore();
    await store.fetchTemplates();

    expect(store.ownTemplates).toEqual(own);
    expect(store.publicTemplates).toEqual(pub);
    expect(store.loading).toBe(false);
  });

  // 2. createTemplate adds new template to ownTemplates
  it('should add new template to beginning of ownTemplates', async () => {
    const existing = makeTemplate({ id: 'tpl-existing' });
    const created = makeTemplate({ id: 'tpl-new', name: 'New Template' });
    vi.mocked(chatTemplateApi.createTemplate).mockResolvedValue(created);

    const store = useChatTemplateStore();
    store.ownTemplates = [existing];

    const result = await store.createTemplate({ name: 'New Template' });

    expect(result).toEqual(created);
    expect(store.ownTemplates).toHaveLength(2);
    expect(store.ownTemplates[0].id).toBe('tpl-new');
    expect(store.ownTemplates[1].id).toBe('tpl-existing');
  });

  // 3. deleteTemplate removes template from ownTemplates
  it('should remove template from ownTemplates on delete', async () => {
    vi.mocked(chatTemplateApi.deleteTemplate).mockResolvedValue(undefined as never);

    const store = useChatTemplateStore();
    store.ownTemplates = [
      makeTemplate({ id: 'tpl-1' }),
      makeTemplate({ id: 'tpl-2' }),
    ];

    await store.deleteTemplate('tpl-1');

    expect(store.ownTemplates).toHaveLength(1);
    expect(store.ownTemplates[0].id).toBe('tpl-2');
    expect(chatTemplateApi.deleteTemplate).toHaveBeenCalledWith('tpl-1');
  });

  // 4. useTemplate calls the API
  it('should call chatTemplateApi.useTemplate', async () => {
    const template = makeTemplate({ id: 'tpl-1', usageCount: 1 });
    vi.mocked(chatTemplateApi.useTemplate).mockResolvedValue(template);

    const store = useChatTemplateStore();
    const result = await store.useTemplate('tpl-1');

    expect(chatTemplateApi.useTemplate).toHaveBeenCalledWith('tpl-1');
    expect(result).toEqual(template);
  });
});
