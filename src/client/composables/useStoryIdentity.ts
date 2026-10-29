import { computed, onScopeDispose, ref, watch } from 'vue';
import { ApiError } from '@client/services/api';
import { userPersonaApi } from '@client/services/user-persona.api';
import type { Chat, User } from '@client/types';
import { storyIdentitySnapshotSchema } from '../../types/story-identity';

export function useStoryIdentity(chat: () => Chat | null, user: () => User | null) {
  const personaName = ref<string | null>(null);
  const loading = ref(false);
  const failed = ref(false);
  let requestVersion = 0;
  let disposed = false;

  const name = computed(() => {
    if (loading.value || failed.value) return null;
    return personaName.value ?? (user()?.name || 'User');
  });

  async function reload() {
    if (disposed) return;
    const version = ++requestVersion;
    const personaId = chat()?.personaId;
    personaName.value = null;
    failed.value = false;
    loading.value = Boolean(personaId);
    const snapshot = chat()?.identitySnapshot;
    if (snapshot != null) {
      loading.value = false;
      const parsed = storyIdentitySnapshotSchema.safeParse(snapshot);
      if (!parsed.success || parsed.data.userId !== user()?.id || parsed.data.tenantId !== user()?.tenantId) {
        failed.value = true;
        return;
      }
      personaName.value = parsed.data.name;
      return;
    }
    if (!personaId) return;

    try {
      const persona = await userPersonaApi.getById(personaId);
      if (version !== requestVersion) return;
      personaName.value = persona.name;
    } catch (error) {
      if (version !== requestVersion) return;
      failed.value = !(error instanceof ApiError && error.status === 404);
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  }

  watch(
    [() => chat()?.id, () => chat()?.personaId, () => chat()?.identitySnapshot, () => user()?.id, () => user()?.tenantId],
    () => { void reload(); },
    { immediate: true, flush: 'sync' },
  );

  onScopeDispose(() => {
    disposed = true;
    requestVersion += 1;
  });

  return { name, loading, failed, reload };
}
