import { expect, it, vi } from 'vitest';
import { creditsApi } from './credits.api';
import { api } from './api';

vi.mock('./api', () => ({ api: { get: vi.fn() } }));

it('encodes offset timestamps and preserves all ledger filters', () => {
  const range = { from: '2026-10-01T08:00:00+08:00', to: '2026-10-26T08:00:00+08:00' };
  creditsApi.getActivity(range);
  expect(new URLSearchParams(vi.mocked(api.get).mock.calls.at(-1)![0].split('?')[1]).get('from')).toBe(range.from);
  creditsApi.getLedger({ ...range, page: 2, limit: 10, kind: 'charge', chatId: 'story-id' });
  const query = new URLSearchParams(vi.mocked(api.get).mock.calls.at(-1)![0].split('?')[1]);
  expect(Object.fromEntries(query)).toEqual({ ...range, page: '2', limit: '10', kind: 'charge', chatId: 'story-id' });
});
