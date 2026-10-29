import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { chatApi } from './chat.api';

vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

describe('chat identity transport', () => {
  const chat = { id: 'story', characterId: 'character', personaId: 'persona', title: 'Story', createdAt: '', updatedAt: '' };
  beforeEach(() => vi.resetAllMocks());

  it('preserves a zero forward cursor for complete recovery', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    await chatApi.getMessages('story', { after: 0, limit: 50 });
    expect(api.get).toHaveBeenCalledWith('/chats/story/messages?after=0&limit=50');
  });

  it('keeps the server binding marker without exposing worldbook contents', async () => {
    vi.mocked(api.get).mockResolvedValue({ ...chat, worldbookSnapshotVersion: 1 });
    const response = await chatApi.getChat('story');
    expect(response.chat.worldbookSnapshotVersion).toBe(1);
    expect(response.chat).not.toHaveProperty('worldbooks');
  });

  it('rejects a malformed snapshot rather than silently treating it as a legacy story', async () => {
    vi.mocked(api.get).mockResolvedValue({ ...chat, identitySnapshot: { protocol: 2, name: 'Changed' } });
    await expect(chatApi.getChat('story')).rejects.toThrow();
  });

  it.each([
    { protocol: 1, status: 'created', chatId: 'original' },
    { protocol: 1, status: 'deleted' },
    { protocol: 1, status: 'not_found' },
  ])('reads a versioned creation result: $status', async (result) => {
    vi.mocked(api.get).mockResolvedValue(result);
    expect(await chatApi.getCreationStatus('request/id')).toEqual(result);
    expect(api.get).toHaveBeenCalledWith('/chats/creation-requests/request%2Fid');
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([{}, { status: 'not_found' }, { protocol: 2, status: 'not_found' }, { protocol: 1, status: 'created' }, null])(
    'rejects unsupported or malformed recovery responses: %s', async (result) => {
      vi.mocked(api.get).mockResolvedValue(result);
      await expect(chatApi.getCreationStatus('request')).rejects.toThrow();
    });

  it('preserves the chosen identity in creation and the returned chat', async () => {
    vi.mocked(api.post).mockResolvedValue(chat);
    const result = await chatApi.createChat({ characterId: 'character', personaId: 'persona' });
    expect(api.post).toHaveBeenCalledWith('/chats', { characterId: 'character', personaId: 'persona' });
    expect(result.chat.personaId).toBe('persona');
  });

  it('preserves identities when restoring from the list or a direct link and after renaming', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ items: [chat] }).mockResolvedValueOnce(chat);
    vi.mocked(api.patch).mockResolvedValue({ ...chat, title: 'Renamed' });
    expect((await chatApi.getChats()).chats[0].personaId).toBe('persona');
    expect((await chatApi.getChat('story')).chat.personaId).toBe('persona');
    expect((await chatApi.updateChat('story', { title: 'Renamed' })).chat.personaId).toBe('persona');
  });

  it('retains an explicit absence of identity', async () => {
    vi.mocked(api.get).mockResolvedValue({ ...chat, personaId: null });
    expect((await chatApi.getChat('story')).chat.personaId).toBeNull();
  });

  it('forwards the caller request key unchanged', async () => {
    vi.mocked(api.post).mockResolvedValue(chat);
    const input = { characterId: 'character', personaId: 'persona', clientRequestId: '550e8400-e29b-41d4-a716-446655440000' };
    await chatApi.createChat(input);
    expect(api.post).toHaveBeenCalledWith('/chats', input);
  });
});
