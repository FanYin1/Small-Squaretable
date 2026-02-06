/**
 * Character Intelligence Store
 *
 * Manages memory and emotion state for characters
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import type { Memory, EmotionState, MemoryType } from '../../types/intelligence';

// Debug event types
interface MemoryRetrievalEvent {
  chatId: string;
  query: string;
  results: Array<{ id: string; content: string; score: number }>;
  latencyMs: number;
  timestamp: string;
}

interface MemoryExtractionEvent {
  chatId: string;
  extracted: Array<{ type: string; content: string; importance: number }>;
  messageCount: number;
  timestamp: string;
}

interface PromptBuildEvent {
  chatId: string;
  tokenCount: number;
  memoriesIncluded: number;
  emotionIncluded: boolean;
  latencyMs: number;
  timestamp: string;
}

interface EmotionChangeEvent {
  chatId: string;
  characterId: string;
  previous: { valence: number; arousal: number; label: string } | null;
  current: { valence: number; arousal: number; label: string };
  trigger: string;
  timestamp: string;
}

export const useCharacterIntelligenceStore = defineStore('characterIntelligence', () => {
  // State
  const memories = ref<Memory[]>([]);
  const currentEmotion = ref<EmotionState | null>(null);
  const emotionHistory = ref<EmotionState[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const selectedCharacterId = ref<string | null>(null);

  // Debug state
  const retrievalHistory = ref<MemoryRetrievalEvent[]>([]);
  const extractionHistory = ref<MemoryExtractionEvent[]>([]);
  const promptBuildHistory = ref<PromptBuildEvent[]>([]);
  const emotionChangeHistory = ref<EmotionChangeEvent[]>([]);
  const debugEventCount = ref(0);

  // Computed
  const memoryCount = computed(() => memories.value.length);

  const memoriesByType = computed(() => {
    const grouped: Record<MemoryType, Memory[]> = {
      fact: [],
      preference: [],
      relationship: [],
      event: [],
    };
    for (const memory of memories.value) {
      grouped[memory.type]?.push(memory);
    }
    return grouped;
  });

  const emotionLabel = computed(() => currentEmotion.value?.label ?? 'neutral');

  // Actions
  async function fetchMemories(characterId: string, chatId?: string, query?: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams();
      if (chatId) params.set('chatId', chatId);
      if (query) params.set('query', query);
      const queryString = params.toString();
      const endpoint = `/characters/${characterId}/intelligence/memories${queryString ? `?${queryString}` : ''}`;

      const response = await api.get<{ memories: Memory[]; total: number }>(endpoint);
      memories.value = response.memories;
      selectedCharacterId.value = characterId;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch memories';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteMemory(characterId: string, memoryId: string, chatId?: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const params = chatId ? `?chatId=${chatId}` : '';
      await api.delete(`/characters/${characterId}/intelligence/memories/${memoryId}${params}`);
      memories.value = memories.value.filter(m => m.id !== memoryId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete memory';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function clearAllMemories(characterId: string, chatId?: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const params = chatId ? `?chatId=${chatId}` : '';
      await api.delete(`/characters/${characterId}/intelligence/memories${params}`);
      memories.value = [];
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to clear memories';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchEmotion(characterId: string, chatId?: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const params = chatId ? `?chatId=${chatId}` : '';
      const response = await api.get<{ current: EmotionState | null; history?: EmotionState[] }>(
        `/characters/${characterId}/intelligence/emotion${params}`
      );
      currentEmotion.value = response.current;
      if (response.history) {
        emotionHistory.value = response.history;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch emotion';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function resetEmotion(characterId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      await api.delete(`/characters/${characterId}/intelligence/emotion`);
      currentEmotion.value = null;
      emotionHistory.value = [];
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to reset emotion';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function extractMemories(characterId: string, chatId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      await api.post(`/characters/${characterId}/intelligence/extract-memories`, {
        chatId,
      });
      // Refresh memories after extraction
      await fetchMemories(characterId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to extract memories';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  function updateEmotionFromWebSocket(emotion: EmotionState) {
    currentEmotion.value = emotion;
    emotionHistory.value.unshift(emotion);
    // Keep only last 50 entries
    if (emotionHistory.value.length > 50) {
      emotionHistory.value = emotionHistory.value.slice(0, 50);
    }
  }

  function reset() {
    memories.value = [];
    currentEmotion.value = null;
    emotionHistory.value = [];
    isLoading.value = false;
    error.value = null;
    selectedCharacterId.value = null;
    // Reset debug state
    retrievalHistory.value = [];
    extractionHistory.value = [];
    promptBuildHistory.value = [];
    emotionChangeHistory.value = [];
    debugEventCount.value = 0;
  }

  // Debug event handlers
  function handleMemoryRetrieval(data: Omit<MemoryRetrievalEvent, 'timestamp'>) {
    retrievalHistory.value.unshift({
      ...data,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 50 entries
    if (retrievalHistory.value.length > 50) {
      retrievalHistory.value = retrievalHistory.value.slice(0, 50);
    }
    debugEventCount.value++;
  }

  function handleMemoryExtraction(data: Omit<MemoryExtractionEvent, 'timestamp'>) {
    extractionHistory.value.unshift({
      ...data,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 50 entries
    if (extractionHistory.value.length > 50) {
      extractionHistory.value = extractionHistory.value.slice(0, 50);
    }
    debugEventCount.value++;
  }

  function handlePromptBuild(data: Omit<PromptBuildEvent, 'timestamp'>) {
    promptBuildHistory.value.unshift({
      ...data,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 50 entries
    if (promptBuildHistory.value.length > 50) {
      promptBuildHistory.value = promptBuildHistory.value.slice(0, 50);
    }
    debugEventCount.value++;
  }

  function handleEmotionChange(data: Omit<EmotionChangeEvent, 'timestamp'>) {
    emotionChangeHistory.value.unshift({
      ...data,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 50 entries
    if (emotionChangeHistory.value.length > 50) {
      emotionChangeHistory.value = emotionChangeHistory.value.slice(0, 50);
    }
    // Also update current emotion
    currentEmotion.value = {
      valence: data.current.valence,
      arousal: data.current.arousal,
      label: data.current.label as EmotionState['label'],
      description: '',
    };
    debugEventCount.value++;
  }

  function resetDebugEventCount() {
    debugEventCount.value = 0;
  }

  return {
    // State
    memories,
    currentEmotion,
    emotionHistory,
    isLoading,
    error,
    selectedCharacterId,
    // Debug state
    retrievalHistory,
    extractionHistory,
    promptBuildHistory,
    emotionChangeHistory,
    debugEventCount,
    // Computed
    memoryCount,
    memoriesByType,
    emotionLabel,
    // Actions
    fetchMemories,
    deleteMemory,
    clearAllMemories,
    fetchEmotion,
    resetEmotion,
    extractMemories,
    updateEmotionFromWebSocket,
    reset,
    // Debug actions
    handleMemoryRetrieval,
    handleMemoryExtraction,
    handlePromptBuild,
    handleEmotionChange,
    resetDebugEventCount,
  };
});
