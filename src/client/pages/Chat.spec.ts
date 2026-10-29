import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import Chat from './Chat.vue';
import i18n from '../i18n';
import { ApiError } from '@client/services/api';

const actions = vi.hoisted(() => ({
  fetchChats: vi.fn(), setCurrentChat: vi.fn(), initWebSocket: vi.fn(), disconnectWebSocket: vi.fn(),
  createChat: vi.fn(), listPersonas: vi.fn(),
  getCreationStatus: vi.fn(),
  getStoryEntry: vi.fn(),
}));
let chatState: { currentChatId: string | null; currentChat: null; chats: { id: string }[] };
let userState: { token: null; user: { id: string; tenantId: string } | null };

vi.mock('@client/stores/chat', () => ({ useChatStore: () => Object.assign(chatState, actions) }));
vi.mock('@client/stores/user', () => ({ useUserStore: () => userState }));
vi.mock('@client/services/chat.api', () => ({ chatApi: { getCreationStatus: actions.getCreationStatus } }));
vi.mock('@client/services/user-persona.api', () => ({ userPersonaApi: { list: actions.listPersonas } }));
vi.mock('@client/services/character.api', () => ({ characterApi: { getStoryEntry: actions.getStoryEntry } }));
vi.mock('@client/components/layout/ExplorationPlayLayout.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@client/components/layout/ExplorationLayout.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@client/components/chat/ChatWindow.vue', () => ({ default: { template: '<div id="reader" />' } }));
vi.mock('@client/components/chat/WelcomePage.vue', () => ({ default: {
  template: '<div id="welcome"><button id="group" @click="$emit(\'select-characters\', [\'first\', \'second\'])">Group</button></div>',
} }));
vi.mock('@client/components/chat/PersonaSelector.vue', () => ({ default: {
  props: ['modelValue', 'busy', 'submissionError', 'blocked', 'navigationOnly'],
  template: `
    <div v-if="modelValue" id="persona-selector">
      <button id="persona-other" :disabled="busy || blocked || navigationOnly" @click="$emit('confirm', 'persona-2')">Other</button>
      <button id="persona-confirm" :disabled="busy || blocked" @click="$emit('confirm', 'persona-1')">Confirm</button>
      <button id="persona-skip" :disabled="busy || blocked" @click="$emit('confirm')">Skip</button>
      <button id="persona-cancel" :disabled="busy" @click="$emit('update:modelValue', false)">Cancel</button>
      <p id="persona-error">{{ submissionError }}</p>
    </div>
  `,
} }));

describe('Chat route restoration', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    userState = reactive({ token: null, user: { id: 'user', tenantId: 'tenant' } });
    actions.getCreationStatus.mockResolvedValue({ protocol: 1, status: 'not_found' });
    chatState = reactive({ currentChatId: null, currentChat: null, chats: [{ id: 'last' }] });
    actions.fetchChats.mockResolvedValue(undefined);
    actions.listPersonas.mockResolvedValue([]);
    actions.createChat.mockResolvedValue({ id: 'created' });
    actions.getStoryEntry.mockImplementation(async (characterId: string) => ({
      characterId, revision: 'a'.repeat(64), name: 'Story', avatarUrl: null,
      description: { text: 'An opening', source: 'opening' }, identity: { status: 'unverified' }, initialFields: [], rulesStatus: 'unadapted',
      openings: [{ reference: { source: 'first_mes', index: 0 }, kind: 'narrative', preview: 'An opening', truncated: false }],
    }));
    actions.setCurrentChat.mockImplementation(async (chatId: string | null) => { chatState.currentChatId = chatId; });
  });

  afterEach(() => { wrapper?.unmount(); });

  async function open(path: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/chat', name: 'Chat', component: { template: '<div />' } },
        { path: '/chat/:chatId', name: 'ChatSession', component: { template: '<div />' } },
      ],
    });
    await router.push(path);
    wrapper = mount(Chat, { global: { plugins: [router, i18n], directives: { loading: () => {} } } });
    await flushPromises();
    return router;
  }

  const recoveryKey = 'story-creation:["tenant","user"]';
  const requestId = '550e8400-e29b-41d4-a716-446655440003';

  it('starts directly with the default identity through the existing recoverable request', async () => {
    actions.listPersonas.mockResolvedValue([{ id: 'preferred', isDefault: true }]);
    const router = await open('/chat?characterId=character&storyEntry=quick');
    expect(actions.createChat).toHaveBeenCalledExactlyOnceWith('character', undefined, undefined, 'preferred', expect.any(String), expect.objectContaining({ reference: { source: 'first_mes', index: 0 } }));
    expect(router.currentRoute.value.path).toBe('/chat/created');
    expect(wrapper.find('#persona-selector').exists()).toBe(false);
    expect(sessionStorage.getItem(recoveryKey)).toBeNull();
  });

  it('does not pick an arbitrary identity when quick start has no default', async () => {
    actions.listPersonas.mockResolvedValue([{ id: 'other', isDefault: false }]);
    await open('/chat?characterId=character&storyEntry=quick');
    expect(actions.createChat).toHaveBeenCalledExactlyOnceWith('character', undefined, undefined, undefined, expect.any(String), expect.objectContaining({ reference: { source: 'first_mes', index: 0 } }));
  });

  it('keeps a failed story-list read in the library recovery view instead of a story-selection error', async () => {
    actions.fetchChats.mockRejectedValueOnce(new Error('list unavailable'));
    await open('/chat');
    expect(wrapper.find('#welcome').exists()).toBe(true);
    expect(wrapper.find('.chat-page-state[role="alert"]').exists()).toBe(false);
    expect(actions.fetchChats).toHaveBeenCalledTimes(1);
    expect(actions.createChat).not.toHaveBeenCalled();
  });

  it('requires an explicit choice if the quick-start identity cannot be loaded', async () => {
    actions.listPersonas.mockRejectedValue(new Error('offline'));
    await open('/chat?characterId=character&storyEntry=quick');
    expect(actions.createChat).not.toHaveBeenCalled();
    expect(wrapper.get('#persona-error').text()).toContain('default persona could not be loaded');
    await wrapper.get('#persona-skip').trigger('click');
    await flushPromises();
    expect(actions.createChat).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a quick-start POST after a lost response and reload', async () => {
    actions.createChat.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'lost response'));
    await open('/chat?characterId=character&storyEntry=quick');
    expect(wrapper.get('#persona-confirm').attributes('disabled')).toBeDefined();
    wrapper.unmount();
    actions.getCreationStatus.mockResolvedValue({ protocol: 1, status: 'created', chatId: 'original' });
    const router = await open('/chat?characterId=character&storyEntry=quick');
    expect(actions.createChat).toHaveBeenCalledTimes(1);
    await wrapper.get('.creation-recovery-actions button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat/original');
  });

  it('recovers after remount and opens the exact story only on explicit action', async () => {
    actions.createChat.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'response lost'));
    await open('/chat?characterId=character&storyEntry=1');
    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    const saved = JSON.parse(sessionStorage.getItem(recoveryKey)!);
    expect(saved.requestId).toBe(actions.createChat.mock.calls[0][4]);
    wrapper.unmount();
    actions.getCreationStatus.mockResolvedValue({ protocol: 1, status: 'created', chatId: 'original' });
    const router = await open('/chat?characterId=character&storyEntry=1');
    expect(actions.getCreationStatus).toHaveBeenCalledExactlyOnceWith(saved.requestId);
    expect(actions.createChat).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/chat');
    expect(wrapper.find('#persona-selector').exists()).toBe(false);
    await wrapper.get('.creation-recovery-actions button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat/original');
    expect(sessionStorage.getItem(recoveryKey)).toBeNull();
    expect(actions.createChat).toHaveBeenCalledTimes(1);
  });

  it.each(['not_found', 'unsupported'])('keeps unknown creation paused on refresh: %s', async (result) => {
    sessionStorage.setItem(recoveryKey, JSON.stringify({ version: 1, requestId }));
    if (result === 'unsupported') actions.getCreationStatus.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'old server'));
    await open('/chat?characterId=character&storyEntry=1');
    expect(wrapper.get('.creation-recovery').text()).toContain('creation remains paused');
    await wrapper.get('#group').trigger('click');
    await wrapper.get('.creation-recovery-actions button').trigger('click');
    await flushPromises();
    expect(actions.getCreationStatus).toHaveBeenCalledTimes(2);
    expect(actions.createChat).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(recoveryKey)).not.toBeNull();
  });

  it('retains a known created story through unsupported lookup and blocked navigation', async () => {
    sessionStorage.setItem(recoveryKey, JSON.stringify({ version: 1, requestId, chatId: 'original' }));
    actions.getCreationStatus.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'old server'));
    const router = await open('/chat');
    const removeGuard = router.beforeEach(to => to.name === 'ChatSession' ? false : true);
    await wrapper.get('.creation-recovery-actions button').trigger('click');
    await flushPromises();
    expect(sessionStorage.getItem(recoveryKey)).not.toBeNull();
    expect(router.currentRoute.value.path).toBe('/chat');
    removeGuard();
    await wrapper.get('.creation-recovery-actions button').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat/original');
    expect(sessionStorage.getItem(recoveryKey)).toBeNull();
    expect(actions.createChat).not.toHaveBeenCalled();
  });

  it('allows explicit dismissal of a confirmed deleted request without recreating it', async () => {
    sessionStorage.setItem(recoveryKey, JSON.stringify({ version: 1, requestId }));
    actions.getCreationStatus.mockResolvedValue({ protocol: 1, status: 'deleted' });
    const router = await open('/chat?characterId=character&storyEntry=1');
    const dismiss = wrapper.findAll('.creation-recovery-actions button').find(button => button.text() === 'Close this request')!;
    await dismiss.trigger('click');
    await flushPromises();
    expect(sessionStorage.getItem(recoveryKey)).toBeNull();
    expect(router.currentRoute.value.fullPath).toBe('/chat');
    expect(actions.createChat).not.toHaveBeenCalled();
  });

  it('waits for account identity before restoring or creating a deep link story', async () => {
    userState.user = null;
    sessionStorage.setItem(recoveryKey, JSON.stringify({ version: 1, requestId }));
    await open('/chat?characterId=character&storyEntry=1');
    expect(actions.createChat).not.toHaveBeenCalled();
    expect(actions.getCreationStatus).not.toHaveBeenCalled();
    userState.user = { id: 'user', tenantId: 'tenant' };
    await flushPromises();
    expect(actions.getCreationStatus).toHaveBeenCalledExactlyOnceWith(requestId);
    expect(actions.createChat).not.toHaveBeenCalled();
  });

  it('does not submit when the pending record cannot be saved', async () => {
    await open('/chat?characterId=character&storyEntry=1');
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable'); });
    try {
      await wrapper.get('#persona-confirm').trigger('click');
      await flushPromises();
      expect(actions.createChat).not.toHaveBeenCalled();
      expect(wrapper.get('#persona-error').text()).toContain('storage permissions');
    } finally {
      storage.mockRestore();
    }
  });

  it('opens the URL story instead of the stored last story', async () => {
    localStorage.setItem('lastChatId', 'last');
    await open('/chat/linked');
    expect(actions.setCurrentChat).toHaveBeenCalledExactlyOnceWith('linked');
    expect(localStorage.getItem('lastChatId')).toBe('linked');
  });

  it('shows the story library without automatically entering the stored last story', async () => {
    localStorage.setItem('lastChatId', 'last');
    const router = await open('/chat');
    expect(router.currentRoute.value.path).toBe('/chat');
    expect(actions.setCurrentChat).toHaveBeenCalledExactlyOnceWith(null);
    expect(localStorage.getItem('lastChatId')).toBe('last');
  });

  it('creates from character entry without restoring a different story', async () => {
    localStorage.setItem('lastChatId', 'last');
    const router = await open('/chat?characterId=character');
    expect(actions.createChat).toHaveBeenCalledTimes(1);
    expect(actions.setCurrentChat).not.toHaveBeenCalledWith('last');
    expect(router.currentRoute.value.fullPath).toBe('/chat/created');
  });

  it('requires identity confirmation for a story entry without loading the persona list first', async () => {
    const router = await open('/chat?characterId=character&storyEntry=1');

    expect(actions.listPersonas).not.toHaveBeenCalled();
    expect(actions.createChat).not.toHaveBeenCalled();
    expect(wrapper.find('#persona-selector').exists()).toBe(true);

    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();

    expect(actions.createChat).toHaveBeenCalledExactlyOnceWith('character', undefined, undefined, 'persona-1', expect.any(String), expect.objectContaining({ reference: { source: 'first_mes', index: 0 } }));
    expect(router.currentRoute.value.fullPath).toBe('/chat/created');
  });

  it('cancels a story entry and removes its pending query', async () => {
    const router = await open('/chat?characterId=character&storyEntry=1');

    await wrapper.get('#persona-cancel').trigger('click');
    await flushPromises();

    expect(actions.createChat).not.toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe('/chat');
  });

  it('starts without a persona after explicit confirmation', async () => {
    const router = await open('/chat?characterId=character&storyEntry=1');
    await wrapper.get('#persona-skip').trigger('click');
    await flushPromises();
    expect(actions.createChat).toHaveBeenCalledExactlyOnceWith('character', undefined, undefined, undefined, expect.any(String), expect.objectContaining({ reference: { source: 'first_mes', index: 0 } }));
    expect(router.currentRoute.value.fullPath).toBe('/chat/created');
  });

  it('blocks immediate recreation when the server response is lost', async () => {
    actions.createChat.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    await open('/chat?characterId=character&storyEntry=1');
    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    expect(wrapper.get('#persona-error').text()).toContain('result is unknown');
    expect((wrapper.get('#persona-confirm').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get('#persona-confirm').trigger('click');
    expect(actions.createChat).toHaveBeenCalledTimes(1);
  });

  it('shows the unresolved result when an automatic entry is reopened', async () => {
    actions.createChat.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    await open('/chat?characterId=character');
    expect(actions.createChat).toHaveBeenCalledTimes(1);
    expect(wrapper.find('#persona-selector').exists()).toBe(false);
    await wrapper.get('[data-testid="review-story-entry"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('#persona-error').text()).toContain('result is unknown');
    expect((wrapper.get('#persona-confirm').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('reuses a created story after navigation is rejected', async () => {
    const router = await open('/chat?characterId=character&storyEntry=1');
    const removeGuard = router.beforeEach((to) => to.name === 'ChatSession' ? false : true);
    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    expect(wrapper.find('#persona-selector').exists()).toBe(true);
    expect(wrapper.get('#persona-error').text()).toContain('was created but could not be opened');
    removeGuard();
    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    expect(actions.createChat).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/chat/created');
  });

  it('does not navigate back when creation finishes after the reader selected another story', async () => {
    let resolveChat!: (value: { id: string }) => void;
    actions.createChat.mockReturnValueOnce(new Promise((resolve) => { resolveChat = resolve; }));
    const router = await open('/chat?characterId=character&storyEntry=1');
    await wrapper.get('#persona-confirm').trigger('click');
    await router.push('/chat/other');
    await flushPromises();
    resolveChat({ id: 'created' });
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat/other');
    expect(wrapper.find('#persona-selector').exists()).toBe(false);
  });

  it('keeps identity confirmation open when chat creation fails and allows retry', async () => {
    actions.createChat.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'temporary failure'));
    const router = await open('/chat?characterId=character&storyEntry=1');

    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();

    expect(wrapper.find('#persona-selector').exists()).toBe(true);
    expect(wrapper.get('#persona-error').text()).toBe('Failed to create chat');
    expect(router.currentRoute.value.fullPath).toBe('/chat?characterId=character&storyEntry=1');

    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    expect(actions.createChat).toHaveBeenCalledTimes(2);
    expect(actions.createChat.mock.calls[0]).toEqual(actions.createChat.mock.calls[1]);
    expect(actions.createChat.mock.calls[0][4]).toMatch(/^[0-9a-f-]{36}$/);
    expect(router.currentRoute.value.fullPath).toBe('/chat/created');
  });

  it('assigns a new request key when identity changes after a definite rejection', async () => {
    actions.createChat.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'temporary failure'));
    await open('/chat?characterId=character&storyEntry=1');
    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    await wrapper.get('#persona-other').trigger('click');
    await flushPromises();
    const [first, second] = actions.createChat.mock.calls;
    expect(first[3]).toBe('persona-1');
    expect(second[3]).toBe('persona-2');
    expect(second[4]).not.toBe(first[4]);
  });

  it('reuses the full group request when retrying without an identity', async () => {
    actions.createChat.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'temporary failure'));
    await open('/chat?storyEntry=1');
    await wrapper.get('#group').trigger('click');
    await flushPromises();
    await wrapper.get('#persona-skip').trigger('click');
    await flushPromises();
    await wrapper.get('#persona-skip').trigger('click');
    await flushPromises();
    expect(actions.createChat).toHaveBeenCalledTimes(2);
    expect(actions.createChat.mock.calls[0]).toEqual(['first', undefined, ['first', 'second'], undefined, expect.any(String), undefined]);
    expect(actions.createChat.mock.calls[1]).toEqual(actions.createChat.mock.calls[0]);
  });

  it.each([
    new ApiError(0, 'NETWORK_ERROR', 'offline'),
    new ApiError(408, 'TIMEOUT', 'timed out'),
    new ApiError(503, 'UNAVAILABLE', 'unavailable'),
    new SyntaxError('Invalid JSON'),
  ])('retains an unresolved operation after closing and reopening: %s', async (error) => {
    actions.createChat.mockRejectedValueOnce(error);
    await open('/chat?characterId=character&storyEntry=1');
    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    await wrapper.get('#persona-cancel').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="review-story-entry"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('#persona-error').text()).toContain('result is unknown');
    expect((wrapper.get('#persona-other').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get('#persona-confirm').trigger('click');
    expect(actions.createChat).toHaveBeenCalledTimes(1);
  });

  it.each([
    { error: new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'conflict'), message: 'differs from the original request' },
    { error: new ApiError(410, 'CREATED_CHAT_DELETED', 'deleted'), message: 'original story was deleted' },
  ])('stops instead of replacing the key after a terminal response: $error.code', async ({ error, message }) => {
    actions.createChat.mockRejectedValueOnce(error);
    await open('/chat?characterId=character&storyEntry=1');
    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    expect(wrapper.get('#persona-error').text()).toContain(message);
    await wrapper.get('#persona-other').trigger('click');
    await wrapper.get('#persona-confirm').trigger('click');
    expect(actions.createChat).toHaveBeenCalledTimes(1);
  });

  it('creates only one chat when identity confirmation is clicked twice', async () => {
    let resolveChat: ((value: { id: string }) => void) | undefined;
    actions.createChat.mockReturnValueOnce(new Promise<{ id: string }>((resolve) => {
      resolveChat = resolve;
    }));
    await open('/chat?characterId=character&storyEntry=1');

    await Promise.all([
      wrapper.get('#persona-confirm').trigger('click'),
      wrapper.get('#persona-confirm').trigger('click'),
    ]);
    expect(actions.createChat).toHaveBeenCalledTimes(1);

    resolveChat?.({ id: 'created' });
    await flushPromises();
  });

  it('updates the URL on selection and restores on browser back', async () => {
    const router = await open('/chat/linked');
    await router.push('/chat/next');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat/next');
    expect(chatState.currentChatId).toBe('next');
    router.back();
    await flushPromises();
    expect(chatState.currentChatId).toBe('linked');
  });

  it('returning to the library keeps the remembered story available', async () => {
    const router = await open('/chat/linked');
    await router.push('/chat');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat');
    expect(chatState.currentChatId).toBeNull();
    expect(localStorage.getItem('lastChatId')).toBe('linked');
    expect(wrapper.find('#welcome').exists()).toBe(true);
  });

  it('keeps a failed deep link visible and retries loading without generating', async () => {
    actions.setCurrentChat.mockRejectedValueOnce(new Error('Unavailable'));
    const router = await open('/chat/missing');
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(router.currentRoute.value.path).toBe('/chat/missing');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(chatState.currentChatId).toBe('missing');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(actions.createChat).not.toHaveBeenCalled();
  });

  async function multipleOpenings(characterId = '00000000-0000-4000-8000-000000000001') {
    const profile = await actions.getStoryEntry(characterId);
    profile.openings = [
      { reference: { source: 'first_mes', index: 0 }, kind: 'initialization', preview: '[开场白]', truncated: false },
      { reference: { source: 'alternate_greetings', index: 2 }, kind: 'narrative', preview: 'The station at dawn.', truncated: false },
    ];
    actions.getStoryEntry.mockResolvedValue(profile);
    return { profile, path: `/chat?characterId=${characterId}&storyEntry=quick` };
  }

  it('selects an opening before creating and submits its original source index only once', async () => {
    const { path } = await multipleOpenings();
    await open(path);
    expect(actions.createChat).not.toHaveBeenCalled();
    await wrapper.get('[data-opening="0"]').trigger('click');
    expect((wrapper.get('[data-testid="opening-start"]').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get('[data-opening="1"]').trigger('click');
    const start = wrapper.get('[data-testid="opening-start"]');
    await start.trigger('click');
    await start.trigger('click');
    await flushPromises();
    expect(actions.createChat).toHaveBeenCalledTimes(1);
    expect(actions.createChat.mock.calls[0][5]).toMatchObject({ reference: { source: 'alternate_greetings', index: 2 } });
  });

  it('keeps a single conflicting opening in preparation and prevents automatic or manual creation', async () => {
    const characterId = '00000000-0000-4000-8000-000000000001';
    const profile = await actions.getStoryEntry(characterId);
    profile.openings[0].record = { version: 1, status: 'conflict', reason: 'native-conflict', adapter: null,
      source: { opening: { source: 'first_mes', index: 0 }, digest: 'a'.repeat(64) }, fields: [] };
    actions.getStoryEntry.mockResolvedValue(profile);
    await open(`/chat?characterId=${characterId}&storyEntry=quick`);
    expect(actions.createChat).not.toHaveBeenCalled();
    await wrapper.get('[data-opening="0"]').trigger('click');
    expect(wrapper.get('[role="alert"]').text()).toContain('尚未核对');
    expect((wrapper.get('[data-testid="opening-start"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(actions.createChat).not.toHaveBeenCalled();
  });

  it('restores a selected opening after refresh without creating a story', async () => {
    const { path } = await multipleOpenings();
    await open(path);
    await wrapper.get('[data-opening="1"]').trigger('click');
    wrapper.unmount();
    await open(path);
    expect(wrapper.get('[data-opening="1"]').attributes('aria-pressed')).toBe('true');
    expect(actions.createChat).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(recoveryKey)).toBeNull();
  });

  it('does not skip known unsupported mechanics for a single narrative opening', async () => {
    const characterId = '00000000-0000-4000-8000-000000000001';
    const profile = await actions.getStoryEntry(characterId);
    profile.openings[0].adaptationReport = { version: 1, entryRevision: profile.revision,
      opening: profile.openings[0].reference, initial: 'unavailable', runtime: 'unsupported',
      findings: [{ code: 'monthly-settlement', sourceDigests: ['a'.repeat(64)] }] };
    actions.getStoryEntry.mockResolvedValue(profile);
    await open(`/chat?characterId=${characterId}&storyEntry=quick`);
    expect(actions.createChat).not.toHaveBeenCalled();
    await wrapper.get('[data-opening="0"]').trigger('click');
    expect(wrapper.get('[data-testid="adaptation-report"]').text()).toContain('周期结算');
    expect((wrapper.get('[data-testid="opening-start"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('cancels preparation without a save or pending creation receipt', async () => {
    const { path } = await multipleOpenings();
    const router = await open(path);
    await wrapper.get('[data-opening="1"]').trigger('click');
    await wrapper.get('.preparation-header .quiet').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/chat');
    expect(router.currentRoute.value.query).toEqual({});
    expect(actions.createChat).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('retains the opening when choosing an optional identity', async () => {
    const { path } = await multipleOpenings();
    await open(path);
    await wrapper.get('[data-opening="1"]').trigger('click');
    await wrapper.get('[data-testid="opening-customize"]').trigger('click');
    await flushPromises();
    expect(actions.createChat).not.toHaveBeenCalled();
    await wrapper.get('#persona-confirm').trigger('click');
    await flushPromises();
    expect(actions.createChat.mock.calls[0][3]).toBe('persona-1');
    expect(actions.createChat.mock.calls[0][5].reference.index).toBe(2);
  });

  it('returns a changed-source failure to preparation without silently recreating', async () => {
    const { path } = await multipleOpenings();
    actions.createChat.mockRejectedValueOnce(new ApiError(409, 'STORY_ENTRY_CHANGED', 'Source changed'));
    await open(path);
    await wrapper.get('[data-opening="1"]').trigger('click');
    await wrapper.get('[data-testid="opening-start"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Source changed');
    expect(actions.createChat).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(recoveryKey)).toBeNull();
  });

  it('shows an entry load failure without falling back to an unselected creation', async () => {
    actions.getStoryEntry.mockRejectedValueOnce(new Error('offline'));
    await open('/chat?characterId=character&storyEntry=quick');
    expect(wrapper.get('[role="alert"]').text()).toContain('No story has been created');
    expect(actions.createChat).not.toHaveBeenCalled();
  });
});
