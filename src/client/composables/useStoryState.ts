import { ref, watch, onScopeDispose } from 'vue';
import { storyApi } from '../services/story.api';
import type { StoryStateView } from '../../types/story-state';

export function useStoryState(scope: () => string | null, chatId: () => string | undefined, busy: () => boolean, revision: () => number) {
  const state = ref<StoryStateView | null>(null);
  const loading = ref(false);
  const error = ref('');
  let epoch = 0;
  async function refresh() {
    const current = ++epoch;
    const target = chatId();
    if (!scope() || !target) { state.value = null; loading.value = false; return; }
    loading.value = true;
    error.value = '';
    try {
      const response = await storyApi.state(target);
      if (current !== epoch) return;
      if (!response) throw new Error('没有收到此次游玩的状态，请重试。');
      state.value = response;
    } catch (failure) {
      if (current === epoch) error.value = failure instanceof Error ? failure.message : '暂时无法读取此次游玩的记录。';
    } finally { if (current === epoch) loading.value = false; }
  }
  watch([scope, chatId], () => { state.value = null; error.value = ''; void refresh(); }, { immediate: true });
  watch([busy, revision], ([active]) => { if (!active) void refresh(); });
  onScopeDispose(() => { epoch++; });
  return { state, loading, error, refresh };
}
