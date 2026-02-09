import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { createLogger } from '@client/utils/logger';
import { developerApi } from '@client/services/developer.api';
import type { ApiKeyInfo, ApiKeyCreatedResponse, CreateApiKeyInput, UpdateApiKeyInput } from '@/types/apiKey';

const logger = createLogger('DeveloperStore');

export const useDeveloperStore = defineStore('developer', () => {
  // State
  const apiKeys = ref<ApiKeyInfo[]>([]);
  const loading = ref(false);
  const availableScopes = ref<string[]>([]);

  // Getters
  const activeKeyCount = computed(() => apiKeys.value.filter((k) => k.isActive).length);

  // Actions
  async function fetchApiKeys() {
    loading.value = true;
    try {
      apiKeys.value = await developerApi.listApiKeys(50, 0);
    } catch (e: unknown) {
      logger.error('Failed to fetch API keys', e);
    } finally {
      loading.value = false;
    }
  }

  async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyCreatedResponse | null> {
    try {
      const result = await developerApi.createApiKey(input);
      apiKeys.value.unshift(result);
      return result;
    } catch (e: unknown) {
      logger.error('Failed to create API key', e);
      return null;
    }
  }

  async function updateApiKey(id: string, input: UpdateApiKeyInput): Promise<boolean> {
    try {
      const updated = await developerApi.updateApiKey(id, input);
      const idx = apiKeys.value.findIndex((k) => k.id === id);
      if (idx !== -1) apiKeys.value[idx] = updated;
      return true;
    } catch (e: unknown) {
      logger.error('Failed to update API key', e);
      return false;
    }
  }

  async function deleteApiKey(id: string): Promise<boolean> {
    try {
      await developerApi.deleteApiKey(id);
      apiKeys.value = apiKeys.value.filter((k) => k.id !== id);
      return true;
    } catch (e: unknown) {
      logger.error('Failed to delete API key', e);
      return false;
    }
  }

  async function fetchScopes() {
    try {
      availableScopes.value = await developerApi.getScopes();
    } catch (e: unknown) {
      logger.error('Failed to fetch scopes', e);
    }
  }

  return {
    apiKeys,
    loading,
    availableScopes,
    activeKeyCount,
    fetchApiKeys,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    fetchScopes,
  };
});
