import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorldBookStore } from './worldbook';
import { worldbookApi } from '@client/services/worldbook.api';
import type { WorldBookDto, WorldBookEntry } from '@client/services/worldbook.api';

vi.mock('@client/services/worldbook.api', () => ({
  worldbookApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getEntries: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const makeWorldBook = (overrides: Partial<WorldBookDto> = {}): WorldBookDto => ({
  id: 'wb-1',
  name: 'Test World Book',
  description: 'A test world book',
  scope: 'global',
  isEnabled: true,
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

const makeEntry = (overrides: Partial<WorldBookEntry> = {}): WorldBookEntry => ({
  id: 'entry-1',
  worldbookId: 'wb-1',
  keyword: 'dragon',
  content: 'A large fire-breathing creature',
  position: 0,
  isEnabled: true,
  priority: 10,
  settings: {},
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

describe('WorldBook Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 1. fetchWorldBooks populates worldbooks array
  it('should populate worldbooks array on fetchWorldBooks', async () => {
    const books = [makeWorldBook({ id: 'wb-1' }), makeWorldBook({ id: 'wb-2', name: 'Second' })];
    vi.mocked(worldbookApi.list).mockResolvedValue(books);

    const store = useWorldBookStore();
    await store.fetchWorldBooks();

    expect(store.worldbooks).toEqual(books);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(worldbookApi.list).toHaveBeenCalledOnce();
  });

  // 2. createWorldBook adds to worldbooks array
  it('should add created world book to worldbooks array', async () => {
    const created = makeWorldBook({ id: 'wb-new', name: 'New Book' });
    vi.mocked(worldbookApi.create).mockResolvedValue(created);

    const store = useWorldBookStore();
    store.worldbooks = [makeWorldBook({ id: 'wb-1' })];

    const result = await store.createWorldBook({ name: 'New Book', scope: 'global' });

    expect(result).toEqual(created);
    expect(store.worldbooks).toHaveLength(2);
    expect(store.worldbooks[1].id).toBe('wb-new');
    expect(worldbookApi.create).toHaveBeenCalledWith({ name: 'New Book', scope: 'global' });
  });

  // 3. deleteWorldBook removes from worldbooks array
  it('should remove world book from worldbooks array on delete', async () => {
    vi.mocked(worldbookApi.delete).mockResolvedValue(undefined as never);

    const store = useWorldBookStore();
    store.worldbooks = [makeWorldBook({ id: 'wb-1' }), makeWorldBook({ id: 'wb-2' })];

    await store.deleteWorldBook('wb-1');

    expect(store.worldbooks).toHaveLength(1);
    expect(store.worldbooks[0].id).toBe('wb-2');
    expect(worldbookApi.delete).toHaveBeenCalledWith('wb-1');
  });

  // 4. fetchEntries populates entries array
  it('should populate entries array on fetchEntries', async () => {
    const entryList = [makeEntry({ id: 'e-1' }), makeEntry({ id: 'e-2', keyword: 'elf' })];
    vi.mocked(worldbookApi.getEntries).mockResolvedValue(entryList);

    const store = useWorldBookStore();
    await store.fetchEntries('wb-1');

    expect(store.entries).toEqual(entryList);
    expect(store.entriesLoading).toBe(false);
    expect(store.error).toBeNull();
    expect(worldbookApi.getEntries).toHaveBeenCalledWith('wb-1');
  });

  // 5. createEntry adds to entries array
  it('should add created entry to entries array', async () => {
    const created = makeEntry({ id: 'e-new', keyword: 'wizard' });
    vi.mocked(worldbookApi.createEntry).mockResolvedValue(created);

    const store = useWorldBookStore();
    store.entries = [makeEntry({ id: 'e-1' })];

    const result = await store.createEntry('wb-1', { keyword: 'wizard', content: 'A magic user' });

    expect(result).toEqual(created);
    expect(store.entries).toHaveLength(2);
    expect(store.entries[1].id).toBe('e-new');
    expect(worldbookApi.createEntry).toHaveBeenCalledWith('wb-1', { keyword: 'wizard', content: 'A magic user' });
  });

  // 6. error state is set on API failure
  it('should set error state on API failure', async () => {
    vi.mocked(worldbookApi.list).mockRejectedValue(new Error('Network error'));

    const store = useWorldBookStore();
    await store.fetchWorldBooks();

    expect(store.error).toBe('Network error');
    expect(store.loading).toBe(false);
    expect(store.worldbooks).toEqual([]);
  });
});
