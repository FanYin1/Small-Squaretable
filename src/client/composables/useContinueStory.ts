import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { chatApi } from '@client/services/chat.api';
import { ApiError } from '@client/services/api';
import type { Chat } from '@client/types';

export function useContinueStory(owner: Readonly<Ref<string | null>>) {
  const story = ref<Chat | null>(null);
  const failed = ref(false);
  const loading = ref(false);
  let version = 0;

  async function refresh() {
    const currentVersion = ++version;
    story.value = null;
    failed.value = false;
    loading.value = false;
    if (!owner.value) return;
    let id: string | null;
    try {
      id = localStorage.getItem('lastChatId');
    } catch {
      return;
    }
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return;
    loading.value = true;
    try {
      const result = await chatApi.getChat(id);
      if (currentVersion !== version) return;
      if (result.chat.id !== id || !result.chat.characterId) return;
      story.value = result.chat;
    } catch (error) {
      if (currentVersion !== version) return;
      failed.value = !(error instanceof ApiError && [403, 404, 410].includes(error.status));
    } finally {
      if (currentVersion === version) loading.value = false;
    }
  }

  watch(owner, refresh, { immediate: true, flush: 'sync' });
  onScopeDispose(() => { version += 1; });
  return { story, failed, loading, refresh };
}
