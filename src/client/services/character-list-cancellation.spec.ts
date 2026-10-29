import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { characterApi } from './character.api';
import { characterCollectionApi } from './character-collection.api';

vi.mock('./api', () => ({ api: { get: vi.fn() } }));

describe('library read cancellation transport', () => {
  beforeEach(() => { vi.mocked(api.get).mockReset(); });

  it('passes the list signal through without changing pagination or data', async () => {
    const controller = new AbortController();
    vi.mocked(api.get).mockResolvedValue({ items: [], pagination: { hasNext: true } });
    expect(await characterApi.getCharacters({ page: 2, limit: 50 }, { signal: controller.signal }))
      .toEqual({ characters: [], pagination: { hasNext: true } });
    expect(api.get).toHaveBeenCalledWith('/characters?page=2&limit=50', { signal: controller.signal });
  });

  it('passes the collection signal and preserves read failures', async () => {
    const controller = new AbortController();
    const failure = new Error('aborted read');
    vi.mocked(api.get).mockRejectedValue(failure);
    await expect(characterCollectionApi.getCollectionCharacters('collection-id', { signal: controller.signal })).rejects.toBe(failure);
    expect(api.get).toHaveBeenCalledWith('/character-collections/collection-id/characters', { signal: controller.signal });
  });

  it('keeps callers without cancellation options working', async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [] });
    expect(await characterApi.getCharacters()).toEqual({ characters: [], pagination: undefined });
    expect(api.get).toHaveBeenCalledWith('/characters', undefined);
  });
});
