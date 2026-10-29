import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { z } from 'zod';
import { chatApi } from '@client/services/chat.api';

const savedRequestSchema = z.object({
  version: z.literal(1),
  requestId: z.string().uuid(),
  chatId: z.string().min(1).optional(),
});
type SavedRequest = z.infer<typeof savedRequestSchema>;

export function useStoryCreationRecovery(owner: Readonly<Ref<string | null>>) {
  const pending = ref<SavedRequest | null>(null);
  const checking = ref(false);
  const status = ref<'pending' | 'created' | 'deleted' | 'not_found' | 'unavailable'>('pending');
  const storageAvailable = ref(true);
  let version = 0;
  let storageKey: string | null = null;

  async function check() {
    if (!pending.value || checking.value) return;
    const requestVersion = version;
    const requestId = pending.value.requestId;
    checking.value = true;
    try {
      const result = await chatApi.getCreationStatus(requestId);
      if (requestVersion !== version) return;
      status.value = result.status;
      if (result.status === 'created') save({ ...pending.value!, chatId: result.chatId });
      else if (result.status === 'deleted' && pending.value) {
        save({ version: 1, requestId });
      }
    } catch {
      if (requestVersion === version) status.value = 'unavailable';
    } finally {
      if (requestVersion === version) checking.value = false;
    }
  }

  function save(request: SavedRequest): boolean {
    pending.value = request;
    try {
      if (!storageKey) return false;
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      storageAvailable.value = true;
      return true;
    } catch {
      storageAvailable.value = false;
      return false;
    }
  }

  function clear(): boolean {
    try {
      if (!storageKey) return false;
      sessionStorage.removeItem(storageKey);
      version += 1;
      checking.value = false;
      pending.value = null;
      status.value = 'pending';
      storageAvailable.value = true;
      return true;
    } catch {
      storageAvailable.value = false;
      return false;
    }
  }

  function begin(requestId: string) {
    if (!storageKey || pending.value || !storageAvailable.value) return null;
    const requestVersion = version;
    if (!save({ version: 1, requestId })) {
      pending.value = null;
      return null;
    }
    status.value = 'pending';
    return {
      created(chatId: string) {
        if (requestVersion !== version) return;
        save({ version: 1, requestId, chatId });
        status.value = 'created';
      },
      rejected() {
        if (requestVersion === version) clear();
      },
    };
  }

  watch(owner, (identity) => {
    version += 1;
    checking.value = false;
    pending.value = null;
    status.value = 'pending';
    storageAvailable.value = true;
    storageKey = identity ? `story-creation:${identity}` : null;
    if (!storageKey) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        pending.value = savedRequestSchema.parse(JSON.parse(saved));
        status.value = pending.value.chatId ? 'created' : 'pending';
        void check();
      }
    } catch {
      storageAvailable.value = false;
    }
  }, { immediate: true, flush: 'sync' });

  onScopeDispose(() => { version += 1; });
  return { pending, status, checking, storageAvailable, begin, check, clear };
}
