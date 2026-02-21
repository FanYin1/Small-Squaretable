import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCharacterIntelligenceStore } from './characterIntelligence';

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '../services/api';

const mockMemory = (overrides = {}) => ({
  id: '1',
  characterId: 'char-1',
  userId: 'user-1',
  type: 'fact' as const,
  content: 'test memory',
  importance: 0.8,
  accessCount: 1,
  sourceChatId: null,
  sourceMessageId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastAccessed: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const mockEmotion = (overrides = {}) => ({
  valence: 0.5,
  arousal: 0.3,
  label: 'happy' as const,
  description: 'feeling good',
  ...overrides,
});

describe('useCharacterIntelligenceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default values', () => {
      const store = useCharacterIntelligenceStore();

      expect(store.memories).toEqual([]);
      expect(store.currentEmotion).toBeNull();
      expect(store.emotionHistory).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.selectedCharacterId).toBeNull();
      expect(store.retrievalHistory).toEqual([]);
      expect(store.extractionHistory).toEqual([]);
      expect(store.promptBuildHistory).toEqual([]);
      expect(store.emotionChangeHistory).toEqual([]);
      expect(store.debugEventCount).toBe(0);
    });
  });

  describe('Computed Properties', () => {
    it('memoryCount returns the number of memories', () => {
      const store = useCharacterIntelligenceStore();
      expect(store.memoryCount).toBe(0);

      store.memories = [mockMemory(), mockMemory({ id: '2' })];
      expect(store.memoryCount).toBe(2);
    });

    it('memoriesByType groups memories by type', () => {
      const store = useCharacterIntelligenceStore();
      store.memories = [
        mockMemory({ id: '1', type: 'fact' }),
        mockMemory({ id: '2', type: 'preference' }),
        mockMemory({ id: '3', type: 'fact' }),
        mockMemory({ id: '4', type: 'relationship' }),
        mockMemory({ id: '5', type: 'event' }),
      ];

      const grouped = store.memoriesByType;
      expect(grouped.fact).toHaveLength(2);
      expect(grouped.preference).toHaveLength(1);
      expect(grouped.relationship).toHaveLength(1);
      expect(grouped.event).toHaveLength(1);
    });

    it('emotionLabel returns label when emotion exists', () => {
      const store = useCharacterIntelligenceStore();
      store.currentEmotion = mockEmotion();
      expect(store.emotionLabel).toBe('happy');
    });

    it('emotionLabel returns neutral when no emotion', () => {
      const store = useCharacterIntelligenceStore();
      expect(store.emotionLabel).toBe('neutral');
    });
  });

  describe('fetchMemories', () => {
    it('should fetch memories without chatId or query', async () => {
      const memories = [mockMemory()];
      vi.mocked(api.get).mockResolvedValue({ memories, total: 1 });

      const store = useCharacterIntelligenceStore();
      await store.fetchMemories('char-1');

      expect(api.get).toHaveBeenCalledWith('/characters/char-1/intelligence/memories');
      expect(store.memories).toEqual(memories);
      expect(store.selectedCharacterId).toBe('char-1');
      expect(store.isLoading).toBe(false);
    });

    it('should fetch memories with chatId and query', async () => {
      vi.mocked(api.get).mockResolvedValue({ memories: [], total: 0 });

      const store = useCharacterIntelligenceStore();
      await store.fetchMemories('char-1', 'chat-1', 'search term');

      expect(api.get).toHaveBeenCalledWith(
        '/characters/char-1/intelligence/memories?chatId=chat-1&query=search+term'
      );
    });

    it('should set error and throw on failure', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      const store = useCharacterIntelligenceStore();
      await expect(store.fetchMemories('char-1')).rejects.toThrow('Network error');
      expect(store.error).toBe('Network error');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('deleteMemory', () => {
    it('should delete memory and remove from array', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      const store = useCharacterIntelligenceStore();
      store.memories = [mockMemory({ id: 'm1' }), mockMemory({ id: 'm2' })];

      await store.deleteMemory('char-1', 'm1', 'chat-1');

      expect(api.delete).toHaveBeenCalledWith(
        '/characters/char-1/intelligence/memories/m1?chatId=chat-1'
      );
      expect(store.memories).toHaveLength(1);
      expect(store.memories[0].id).toBe('m2');
      expect(store.isLoading).toBe(false);
    });

    it('should set error and throw on failure', async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error('Delete failed'));

      const store = useCharacterIntelligenceStore();
      await expect(store.deleteMemory('char-1', 'm1')).rejects.toThrow('Delete failed');
      expect(store.error).toBe('Delete failed');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('clearAllMemories', () => {
    it('should clear all memories', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      const store = useCharacterIntelligenceStore();
      store.memories = [mockMemory(), mockMemory({ id: '2' })];

      await store.clearAllMemories('char-1', 'chat-1');

      expect(api.delete).toHaveBeenCalledWith(
        '/characters/char-1/intelligence/memories?chatId=chat-1'
      );
      expect(store.memories).toEqual([]);
      expect(store.isLoading).toBe(false);
    });

    it('should set error and throw on failure', async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error('Clear failed'));

      const store = useCharacterIntelligenceStore();
      await expect(store.clearAllMemories('char-1')).rejects.toThrow('Clear failed');
      expect(store.error).toBe('Clear failed');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('fetchEmotion', () => {
    it('should fetch emotion and set current + history', async () => {
      const current = mockEmotion();
      const history = [mockEmotion({ label: 'calm' }), mockEmotion({ label: 'excited' })];
      vi.mocked(api.get).mockResolvedValue({ current, history });

      const store = useCharacterIntelligenceStore();
      await store.fetchEmotion('char-1', 'chat-1');

      expect(api.get).toHaveBeenCalledWith(
        '/characters/char-1/intelligence/emotion?chatId=chat-1'
      );
      expect(store.currentEmotion).toEqual(current);
      expect(store.emotionHistory).toEqual(history);
      expect(store.isLoading).toBe(false);
    });

    it('should set error and throw on failure', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Emotion fetch failed'));

      const store = useCharacterIntelligenceStore();
      await expect(store.fetchEmotion('char-1')).rejects.toThrow('Emotion fetch failed');
      expect(store.error).toBe('Emotion fetch failed');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('resetEmotion', () => {
    it('should reset emotion state', async () => {
      vi.mocked(api.delete).mockResolvedValue(undefined);

      const store = useCharacterIntelligenceStore();
      store.currentEmotion = mockEmotion();
      store.emotionHistory = [mockEmotion()];

      await store.resetEmotion('char-1');

      expect(api.delete).toHaveBeenCalledWith('/characters/char-1/intelligence/emotion');
      expect(store.currentEmotion).toBeNull();
      expect(store.emotionHistory).toEqual([]);
      expect(store.isLoading).toBe(false);
    });

    it('should set error and throw on failure', async () => {
      vi.mocked(api.delete).mockRejectedValue(new Error('Reset failed'));

      const store = useCharacterIntelligenceStore();
      await expect(store.resetEmotion('char-1')).rejects.toThrow('Reset failed');
      expect(store.error).toBe('Reset failed');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('extractMemories', () => {
    it('should extract memories and refresh', async () => {
      vi.mocked(api.post).mockResolvedValue(undefined);
      vi.mocked(api.get).mockResolvedValue({ memories: [mockMemory()], total: 1 });

      const store = useCharacterIntelligenceStore();
      await store.extractMemories('char-1', 'chat-1');

      expect(api.post).toHaveBeenCalledWith(
        '/characters/char-1/intelligence/extract-memories',
        { chatId: 'chat-1' }
      );
      expect(api.get).toHaveBeenCalledWith('/characters/char-1/intelligence/memories');
      expect(store.memories).toHaveLength(1);
      expect(store.isLoading).toBe(false);
    });

    it('should set error and throw on failure', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Extract failed'));

      const store = useCharacterIntelligenceStore();
      await expect(store.extractMemories('char-1', 'chat-1')).rejects.toThrow('Extract failed');
      expect(store.error).toBe('Extract failed');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('consolidateMemories', () => {
    it('should call API and refresh memories', async () => {
      vi.mocked(api.post).mockResolvedValue({ consolidated: 3 });
      vi.mocked(api.get).mockResolvedValue({ memories: [mockMemory()], total: 1 });

      const store = useCharacterIntelligenceStore();
      const result = await store.consolidateMemories('char-1');

      expect(api.post).toHaveBeenCalledWith('/characters/char-1/intelligence/consolidate');
      expect(api.get).toHaveBeenCalledWith('/characters/char-1/intelligence/memories');
      expect(store.memories).toHaveLength(1);
      expect(result).toEqual({ consolidated: 3 });
      expect(store.isLoading).toBe(false);
    });

    it('should set error on failure', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Consolidation failed'));

      const store = useCharacterIntelligenceStore();
      await expect(store.consolidateMemories('char-1')).rejects.toThrow('Consolidation failed');
      expect(store.error).toBe('Consolidation failed');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('promoteMemories', () => {
    it('should call API and refresh memories', async () => {
      vi.mocked(api.post).mockResolvedValue({ promoted: 2 });
      vi.mocked(api.get).mockResolvedValue({ memories: [mockMemory()], total: 1 });

      const store = useCharacterIntelligenceStore();
      const result = await store.promoteMemories('char-1');

      expect(api.post).toHaveBeenCalledWith('/characters/char-1/intelligence/promote');
      expect(api.get).toHaveBeenCalledWith('/characters/char-1/intelligence/memories');
      expect(store.memories).toHaveLength(1);
      expect(result).toEqual({ promoted: 2 });
      expect(store.isLoading).toBe(false);
    });

    it('should set error on failure', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Promotion failed'));

      const store = useCharacterIntelligenceStore();
      await expect(store.promoteMemories('char-1')).rejects.toThrow('Promotion failed');
      expect(store.error).toBe('Promotion failed');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('globalMemories', () => {
    it('should filter memories without sourceChatId', () => {
      const store = useCharacterIntelligenceStore();
      store.memories = [
        mockMemory({ id: '1', sourceChatId: null }),
        mockMemory({ id: '2', sourceChatId: 'chat-1' }),
        mockMemory({ id: '3', sourceChatId: null }),
      ];

      expect(store.globalMemories).toHaveLength(2);
      expect(store.globalMemories.map(m => m.id)).toEqual(['1', '3']);
    });
  });

  describe('sessionMemories', () => {
    it('should filter memories with sourceChatId', () => {
      const store = useCharacterIntelligenceStore();
      store.memories = [
        mockMemory({ id: '1', sourceChatId: null }),
        mockMemory({ id: '2', sourceChatId: 'chat-1' }),
        mockMemory({ id: '3', sourceChatId: 'chat-2' }),
      ];

      expect(store.sessionMemories).toHaveLength(2);
      expect(store.sessionMemories.map(m => m.id)).toEqual(['2', '3']);
    });
  });

  describe('updateEmotionFromWebSocket', () => {
    it('should update current emotion and prepend to history', () => {
      const store = useCharacterIntelligenceStore();
      const emotion = mockEmotion();

      store.updateEmotionFromWebSocket(emotion);

      expect(store.currentEmotion).toEqual(emotion);
      expect(store.emotionHistory[0]).toEqual(emotion);
      expect(store.emotionHistory).toHaveLength(1);
    });

    it('should cap history at 50 entries', () => {
      const store = useCharacterIntelligenceStore();
      // Fill with 50 entries
      for (let i = 0; i < 50; i++) {
        store.emotionHistory.push(mockEmotion({ description: `entry-${i}` }));
      }
      expect(store.emotionHistory).toHaveLength(50);

      // Adding one more should still cap at 50
      store.updateEmotionFromWebSocket(mockEmotion({ description: 'new' }));
      expect(store.emotionHistory).toHaveLength(50);
      expect(store.emotionHistory[0].description).toBe('new');
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const store = useCharacterIntelligenceStore();
      // Populate state
      store.memories = [mockMemory()];
      store.currentEmotion = mockEmotion();
      store.emotionHistory = [mockEmotion()];
      store.isLoading = true;
      store.error = 'some error';
      store.selectedCharacterId = 'char-1';
      store.retrievalHistory = [{ chatId: 'c', query: 'q', results: [], latencyMs: 10, timestamp: '' }];
      store.extractionHistory = [{ chatId: 'c', extracted: [], messageCount: 1, timestamp: '' }];
      store.promptBuildHistory = [{ chatId: 'c', tokenCount: 100, memoriesIncluded: 5, emotionIncluded: true, latencyMs: 10, timestamp: '' }];
      store.emotionChangeHistory = [{ chatId: 'c', characterId: 'ch', previous: null, current: { valence: 0, arousal: 0, label: 'calm' }, trigger: 't', timestamp: '' }];
      store.debugEventCount = 5;

      store.reset();

      expect(store.memories).toEqual([]);
      expect(store.currentEmotion).toBeNull();
      expect(store.emotionHistory).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.selectedCharacterId).toBeNull();
      expect(store.retrievalHistory).toEqual([]);
      expect(store.extractionHistory).toEqual([]);
      expect(store.promptBuildHistory).toEqual([]);
      expect(store.emotionChangeHistory).toEqual([]);
      expect(store.debugEventCount).toBe(0);
    });
  });

  describe('Debug Event Handlers', () => {
    it('handleMemoryRetrieval adds event and increments count', () => {
      const store = useCharacterIntelligenceStore();

      store.handleMemoryRetrieval({
        chatId: 'chat-1',
        query: 'test query',
        results: [{ id: '1', content: 'result', score: 0.9 }],
        latencyMs: 15,
      });

      expect(store.retrievalHistory).toHaveLength(1);
      expect(store.retrievalHistory[0].chatId).toBe('chat-1');
      expect(store.retrievalHistory[0].timestamp).toBeTruthy();
      expect(store.debugEventCount).toBe(1);
    });

    it('handleMemoryExtraction adds event and increments count', () => {
      const store = useCharacterIntelligenceStore();

      store.handleMemoryExtraction({
        chatId: 'chat-1',
        extracted: [{ type: 'fact', content: 'extracted', importance: 0.7 }],
        messageCount: 5,
      });

      expect(store.extractionHistory).toHaveLength(1);
      expect(store.extractionHistory[0].messageCount).toBe(5);
      expect(store.debugEventCount).toBe(1);
    });

    it('handlePromptBuild adds event and caps at 50', () => {
      const store = useCharacterIntelligenceStore();

      // Fill to 50
      for (let i = 0; i < 55; i++) {
        store.handlePromptBuild({
          chatId: `chat-${i}`,
          tokenCount: 100,
          memoriesIncluded: 5,
          emotionIncluded: true,
          latencyMs: 10,
        });
      }

      expect(store.promptBuildHistory).toHaveLength(50);
      expect(store.promptBuildHistory[0].chatId).toBe('chat-54');
      expect(store.debugEventCount).toBe(55);
    });

    it('handleEmotionChange adds event and updates currentEmotion', () => {
      const store = useCharacterIntelligenceStore();

      store.handleEmotionChange({
        chatId: 'chat-1',
        characterId: 'char-1',
        previous: null,
        current: { valence: 0.7, arousal: 0.4, label: 'excited' },
        trigger: 'user message',
      });

      expect(store.emotionChangeHistory).toHaveLength(1);
      expect(store.currentEmotion).toEqual({
        valence: 0.7,
        arousal: 0.4,
        label: 'excited',
        description: '',
      });
      expect(store.debugEventCount).toBe(1);
    });

    it('resetDebugEventCount resets to 0', () => {
      const store = useCharacterIntelligenceStore();
      store.debugEventCount = 42;

      store.resetDebugEventCount();

      expect(store.debugEventCount).toBe(0);
    });
  });
});
