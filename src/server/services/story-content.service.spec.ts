import { describe, expect, it, vi } from 'vitest';
import { resolveStoryCharacterListSummaries } from './story-content.service';

describe('resolveStoryCharacterListSummaries', () => {
  it('does not query story snapshots when the page has no versioned stories', async () => {
    const database = { execute: vi.fn() };

    const result = await resolveStoryCharacterListSummaries([
      { id: 'legacy-chat', contentSnapshotVersion: null, characterId: 'character-1' },
    ], database as never);

    expect(result).toEqual(new Map());
    expect(database.execute).not.toHaveBeenCalled();
  });

  it('loads all versioned story character previews with one query', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue([
        { chatId: 'chat-1', characterId: 'character-1', name: '苏苏', avatarUrl: '/susu.webp' },
        { chatId: 'chat-2', characterId: 'character-2', name: '凡音', avatarUrl: null },
      ]),
    };

    const result = await resolveStoryCharacterListSummaries([
      { id: 'chat-1', contentSnapshotVersion: 1, characterId: 'character-1' },
      { id: 'chat-2', contentSnapshotVersion: 1, characterId: 'character-2' },
    ], database as never);

    expect(database.execute).toHaveBeenCalledTimes(1);
    expect(result.get('chat-1:character-1')).toEqual({
      chatId: 'chat-1', characterId: 'character-1', name: '苏苏', avatarUrl: '/susu.webp',
    });
    expect(result.get('chat-2:character-2')).toEqual({
      chatId: 'chat-2', characterId: 'character-2', name: '凡音', avatarUrl: null,
    });
  });
});
