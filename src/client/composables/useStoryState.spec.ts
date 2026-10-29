import { describe, it, expect, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useStoryState } from './useStoryState';
import { storyApi } from '../services/story.api';
import type { StoryStateView } from '../../types/story-state';

vi.mock('../services/story.api', () => ({ storyApi: { state: vi.fn() } }));
const saved: StoryStateView = { protocol: 1, legacy: false, native: true, version: 3, revision: 'saved', fields: [], actions: [], map: null, events: [], notes: [] };
describe('saved exploration state requests', () => {
  it('loads the current action version when a rejected request finishes', async () => {
    vi.mocked(storyApi.state).mockResolvedValueOnce(saved).mockResolvedValueOnce({ ...saved, version: 4 });
    const busy = ref(false);
    const revision = ref(0);
    const scope = effectScope();
    const result = scope.run(() => useStoryState(() => 'owner', () => 'story', () => busy.value, () => revision.value))!;
    await flushPromises();
    busy.value = true;
    await flushPromises();
    expect(storyApi.state).toHaveBeenCalledTimes(1);
    busy.value = false;
    revision.value++;
    await flushPromises();
    expect(result.state.value?.version).toBe(4);
    expect(storyApi.state).toHaveBeenCalledTimes(2);
    scope.stop();
  });
  it('discards a previous account response after logout', async () => {
    let resolve!: (value: StoryStateView) => void;
    vi.mocked(storyApi.state).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const owner = ref<string | null>('owner');
    const scope = effectScope();
    const result = scope.run(() => useStoryState(() => owner.value, () => 'story', () => false, () => 0))!;
    owner.value = null;
    await flushPromises(); resolve(saved); await flushPromises();
    expect(result.state.value).toBeNull();
    expect(result.loading.value).toBe(false);
    scope.stop();
  });
  it('does not replace a new story with an older late response', async () => {
    let resolve!: (value: StoryStateView) => void;
    vi.mocked(storyApi.state).mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce({ ...saved, revision: 'new' });
    const chat = ref('old');
    const scope = effectScope();
    const result = scope.run(() => useStoryState(() => 'owner', () => chat.value, () => false, () => 0))!;
    chat.value = 'new'; await flushPromises(); resolve(saved); await flushPromises();
    expect(result.state.value?.revision).toBe('new'); scope.stop();
  });
  it('retains last confirmed data with a visible error, then recovers', async () => {
    vi.mocked(storyApi.state).mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...saved, version: 4 });
    const scope = effectScope();
    const result = scope.run(() => useStoryState(() => 'owner', () => 'story', () => false, () => 0))!;
    await flushPromises(); await result.refresh();
    expect(result.state.value?.version).toBe(3); expect(result.error.value).toBe('offline');
    await result.refresh(); expect(result.state.value?.version).toBe(4); expect(result.error.value).toBe(''); scope.stop();
  });
});
