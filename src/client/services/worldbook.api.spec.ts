import { describe, it, expect, vi } from 'vitest';
import { worldbookApi } from './worldbook.api';
import { api } from './api';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('worldbookApi', () => {
  it('list() calls GET /worldbooks', async () => {
    await worldbookApi.list();
    expect(api.get).toHaveBeenCalledWith('/worldbooks');
  });

  it('create() sends correct data to POST /worldbooks', async () => {
    const data = { name: 'My World', scope: 'global' as const };
    await worldbookApi.create(data);
    expect(api.post).toHaveBeenCalledWith('/worldbooks', data);
  });

  it('getEntries() calls GET /worldbooks/:id/entries', async () => {
    await worldbookApi.getEntries('wb-123');
    expect(api.get).toHaveBeenCalledWith('/worldbooks/wb-123/entries');
  });
});
