import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { ApiError } from '@client/services/api';
import { useContinueStory } from './useContinueStory';

const { getChat } = vi.hoisted(() => ({ getChat: vi.fn() }));
vi.mock('@client/services/chat.api', () => ({ chatApi: { getChat } }));
const chat = { id: 'chat-1', title: 'Lantern room', characterId: 'char-1', characterName: 'Mara', createdAt: '' };
let scope: EffectScope;
function render(initialOwner: string | null = 'tenant:user') {
  const owner = ref(initialOwner);
  scope = effectScope();
  return { ...scope.run(() => useContinueStory(owner))!, owner };
}

beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); });
afterEach(() => { scope?.stop(); vi.restoreAllMocks(); });

describe('continue story', () => {
  it('does not reserve a story or request data without a record or authenticated owner', async () => {
    const state = render(null);
    localStorage.setItem('lastChatId', 'chat-1');
    await state.refresh();
    expect(getChat).not.toHaveBeenCalled();
    expect(state.story.value).toBeNull();
    localStorage.clear();
    state.owner.value = 'tenant:user';
    expect(getChat).not.toHaveBeenCalled();
  });

  it('shows only an API-verified story and retries temporary failure', async () => {
    localStorage.setItem('lastChatId', 'chat-1');
    getChat.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'Offline')).mockResolvedValueOnce({ chat });
    const state = render();
    await flushPromises();
    expect(state.failed.value).toBe(true);
    expect(state.story.value).toBeNull();
    await state.refresh();
    expect(getChat).toHaveBeenCalledWith('chat-1');
    expect(state.story.value?.id).toBe('chat-1');
    expect(state.failed.value).toBe(false);
  });

  it.each([403, 404, 410])('hides unauthorized or deleted saved records (%s)', async status => {
    localStorage.setItem('lastChatId', 'chat-1');
    getChat.mockRejectedValue(new ApiError(status, 'NOT_FOUND', 'Missing'));
    const state = render();
    await flushPromises();
    expect(state.story.value).toBeNull();
    expect(state.failed.value).toBe(false);
  });

  it('ignores the previous account response and clears content synchronously on logout', async () => {
    localStorage.setItem('lastChatId', 'chat-1');
    let resolveOld!: (value: unknown) => void;
    getChat.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Missing'));
    const state = render();
    state.owner.value = 'tenant:other-user';
    resolveOld({ chat });
    await flushPromises();
    expect(state.story.value).toBeNull();
    getChat.mockResolvedValue({ chat });
    await state.refresh();
    state.owner.value = null;
    expect(state.story.value).toBeNull();
  });

  it('ignores results after unmount and tolerates storage being unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
    const state = render();
    expect(state.story.value).toBeNull();
    expect(getChat).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    localStorage.setItem('lastChatId', 'chat-1');
    let resolveRequest!: (value: unknown) => void;
    getChat.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
    const pending = state.refresh();
    scope.stop();
    resolveRequest({ chat });
    await pending;
    expect(state.story.value).toBeNull();
  });
});
