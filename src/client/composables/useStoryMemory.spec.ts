import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useStoryMemory } from './useStoryMemory';
import { storyApi } from '../services/story.api';
import type { StoryMemoryView } from '../../types/story-memory';

vi.mock('../services/story.api', () => ({ storyApi: { memory: vi.fn() } }));
const jobId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const saved: StoryMemoryView = { supported: true, batchSize: 5, counts: { pending: 0, running: 0, retry: 0, failed: 1, succeeded: 0 },
  accumulating: [], jobs: [{ id: jobId, characterName: '记录员', status: 'failed', recoveryPending: false, retainedMemories: 0, sourcesAvailable: false, sources: [] }], nextBefore: jobId };
function deferred() {
  let resolve!: (value: StoryMemoryView) => void;
  const promise = new Promise<StoryMemoryView>(done => { resolve = done; });
  return { promise, resolve };
}
function setup() {
  const owner = ref<string | null>('owner');
  const chat = ref('story');
  const busy = ref(false);
  const version = ref(1);
  const scope = effectScope();
  const state = scope.run(() => useStoryMemory(() => owner.value, () => chat.value, () => busy.value, () => version.value))!;
  return { owner, chat, busy, version, scope, state };
}
beforeEach(() => vi.mocked(storyApi.memory).mockReset());
describe('story memory progress reads', () => {
  it('reads on entry and refreshes after a finished generation, without polling while busy', async () => {
    vi.mocked(storyApi.memory).mockResolvedValue(saved);
    const test = setup(); await flushPromises();
    test.busy.value = true; await flushPromises();
    expect(storyApi.memory).toHaveBeenCalledTimes(1);
    test.version.value++; await flushPromises();
    expect(storyApi.memory).toHaveBeenCalledTimes(1);
    test.busy.value = false; await flushPromises();
    expect(storyApi.memory).toHaveBeenCalledTimes(2);
    test.scope.stop();
  });
  it.each(['chat', 'owner'] as const)('discards late responses after %s changes', async field => {
    const pending = deferred();
    vi.mocked(storyApi.memory).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...saved, jobs: [] });
    const test = setup(); test[field].value = 'new'; await flushPromises();
    pending.resolve(saved); await flushPromises();
    expect(test.state.memory.value?.jobs).toEqual([]); test.scope.stop();
  });
  it('clears all state on logout and ignores an in-flight response', async () => {
    const pending = deferred(); vi.mocked(storyApi.memory).mockReturnValue(pending.promise);
    const test = setup(); test.owner.value = null;
    pending.resolve(saved); await flushPromises();
    expect(test.state.memory.value).toBeNull(); expect(test.state.loading.value).toBe(false);
    await test.state.refresh(); expect(storyApi.memory).toHaveBeenCalledTimes(1); test.scope.stop();
  });
  it('keeps the last read on failure and does not expose raw provider errors', async () => {
    vi.mocked(storyApi.memory).mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAILS')).mockResolvedValueOnce({ ...saved, jobs: [] });
    const test = setup(); await flushPromises(); await test.state.refresh();
    expect(test.state.memory.value?.jobs).toHaveLength(1); expect(test.state.error.value).toContain('重新读取');
    expect(test.state.error.value).not.toContain('PRIVATE');
    await test.state.refresh(); expect(test.state.error.value).toBe(''); test.scope.stop();
  });
  it('rejects malformed successful responses instead of claiming empty progress', async () => {
    vi.mocked(storyApi.memory).mockResolvedValue({} as StoryMemoryView);
    const test = setup(); await flushPromises();
    expect(test.state.memory.value).toBeNull(); expect(test.state.error.value).not.toBe(''); test.scope.stop();
  });
  it('paginates by the saved cursor, deduplicates and stops at the end', async () => {
    vi.mocked(storyApi.memory).mockResolvedValueOnce(saved).mockResolvedValueOnce({ ...saved, jobs: [...saved.jobs, { ...saved.jobs[0], id: secondId }], nextBefore: null });
    const test = setup(); await flushPromises(); await test.state.loadMore();
    expect(storyApi.memory).toHaveBeenLastCalledWith('story', jobId);
    expect(test.state.memory.value?.jobs).toHaveLength(2);
    await test.state.loadMore(); expect(storyApi.memory).toHaveBeenCalledTimes(2); test.scope.stop();
  });
  it('retains the cursor and records when loading earlier history fails', async () => {
    vi.mocked(storyApi.memory).mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error('offline'));
    const test = setup(); await flushPromises(); await test.state.loadMore();
    expect(test.state.memory.value?.nextBefore).toBe(jobId); expect(test.state.memory.value?.jobs).toHaveLength(1);
    expect(test.state.error.value).toContain('较早'); test.scope.stop();
  });
  it('ignores a late pagination response after refreshing the first page', async () => {
    const pending = deferred();
    vi.mocked(storyApi.memory).mockResolvedValueOnce(saved).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...saved, jobs: [] });
    const test = setup(); await flushPromises(); const loading = test.state.loadMore();
    await test.state.refresh(); pending.resolve(saved); await loading;
    expect(test.state.memory.value?.jobs).toEqual([]); test.scope.stop();
  });
  it('does not refetch or apply results after leaving the panel', async () => {
    const pending = deferred(); vi.mocked(storyApi.memory).mockReturnValueOnce(pending.promise);
    const test = setup(); test.scope.stop(); pending.resolve(saved); await flushPromises();
    await test.state.refresh(); expect(test.state.memory.value).toBeNull(); expect(storyApi.memory).toHaveBeenCalledTimes(1);
  });
});
