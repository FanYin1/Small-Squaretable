import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../../db', () => ({ db: {} }));
import { captureStoryWorldbooks, loadStoryWorldbookScan } from './story-worldbooks.service';
import { storyWorldbooksSnapshotSchema } from '../../types/story-worldbooks';
import type { Database } from '../../db';

const characterId = '10000000-0000-4000-8000-000000000001';
const original = { protocol: 1, capturedAt: '2026-11-05T00:00:00.000Z', revision: 'a'.repeat(64),
  bindings: [{ characterId, books: [] }] };
function database(snapshot: unknown) {
  const where = vi.fn().mockResolvedValue([{ snapshot }]);
  const query = { from: vi.fn(), innerJoin: vi.fn(), where };
  query.from.mockReturnValue(query); query.innerJoin.mockReturnValue(query);
  return { select: vi.fn().mockReturnValue(query) } as unknown as Database;
}
afterEach(() => vi.unstubAllEnvs());

describe('Frozen worldbook scan version', () => {
  it('preserves old snapshots without inventing a new scan configuration', async () => {
    expect(storyWorldbooksSnapshotSchema.parse(original)).not.toHaveProperty('scan');
    const saved = await loadStoryWorldbookScan('story', 'owner', characterId, database(original));
    expect(saved).toEqual({ entries: [], scan: undefined, revision: original.revision });
  });
  it('freezes new-story configuration and includes it in the revision', async () => {
    vi.stubEnv('WORLD_INFO_SCAN_MESSAGE_COUNT', '12');
    vi.stubEnv('WORLD_INFO_MAX_RECURSION_DEPTH', '2');
    vi.stubEnv('WORLD_INFO_TOKEN_BUDGET', '3000');
    const transaction = {} as Parameters<typeof captureStoryWorldbooks>[0];
    const snapshot = await captureStoryWorldbooks(transaction, [characterId], []);
    expect(snapshot.scan).toEqual({ version: 2, scanMessageCount: 12, maxRecursionDepth: 2, tokenBudget: 3000 });
    vi.stubEnv('WORLD_INFO_TOKEN_BUDGET', '4000');
    const next = await captureStoryWorldbooks(transaction, [characterId], []);
    expect(next.revision).not.toBe(snapshot.revision);
    const saved = await loadStoryWorldbookScan('story', 'owner', characterId, database(snapshot));
    expect(saved.scan?.tokenBudget).toBe(3000);
  });
  it('rejects unknown scan versions instead of silently upgrading a saved story', () => {
    expect(storyWorldbooksSnapshotSchema.safeParse({ ...original,
      scan: { version: 99, scanMessageCount: 10, maxRecursionDepth: 3, tokenBudget: 2048 } }).success).toBe(false);
  });
  it('rejects missing bindings instead of falling back to global library data', async () => {
    await expect(loadStoryWorldbookScan('story', 'owner', 'other-character', database(original)))
      .rejects.toMatchObject({ code: 'STORY_WORLDBOOKS_UNBOUND' });
  });
});
