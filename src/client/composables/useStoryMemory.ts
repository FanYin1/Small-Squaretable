import { onScopeDispose, ref, watch } from 'vue';
import { storyApi } from '../services/story.api';
import { storyMemoryViewSchema, type StoryMemoryView } from '../../types/story-memory';

export function useStoryMemory(scope: () => string | null, chatId: () => string, busy: () => boolean, version: () => number) {
  const memory = ref<StoryMemoryView | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref('');
  let epoch = 0;
  let disposed = false;
  async function read(append = false) {
    if (disposed || !scope() || !chatId()) return;
    const before = append ? memory.value?.nextBefore : undefined;
    if (append && (!before || loading.value || loadingMore.value)) return;
    const current = ++epoch;
    loading.value = !append;
    loadingMore.value = append;
    error.value = '';
    try {
      const response = storyMemoryViewSchema.parse(await storyApi.memory(chatId(), before ?? undefined));
      if (current !== epoch) return;
      memory.value = append && memory.value
        ? { ...response, jobs: [...new Map([...memory.value.jobs, ...response.jobs].map(job => [job.id, job])).values()] }
        : response;
    } catch {
      if (current === epoch) error.value = append ? '较早的整理记录读取失败，请重试。' : '暂时无法读取记忆整理进度，请重新读取。';
    } finally {
      if (current === epoch) { loading.value = false; loadingMore.value = false; }
    }
  }
  function reset() {
    epoch++;
    memory.value = null; loading.value = false; loadingMore.value = false; error.value = '';
    void read();
  }
  watch([scope, chatId], reset, { immediate: true, flush: 'sync' });
  watch([busy, version], ([active]) => { if (!active) void read(); });
  onScopeDispose(() => { disposed = true; epoch++; });
  return { memory, loading, loadingMore, error, refresh: () => read(), loadMore: () => read(true) };
}
