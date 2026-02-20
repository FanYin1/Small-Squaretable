// src/server/services/intelligence-debug.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/repositories/memory.repository', () => ({
  memoryRepository: {},
}));

vi.mock('../../db/repositories/emotion.repository', () => ({
  emotionRepository: {},
}));

vi.mock('./memory.service', () => ({
  memoryService: { retrieveMemories: vi.fn() },
}));

vi.mock('./emotion.service', () => ({
  emotionService: { getCurrentEmotion: vi.fn() },
}));

vi.mock('./chat.service', () => ({
  chatService: {},
}));

import { intelligenceDebugService } from './intelligence-debug.service';

const CHAR_ID = 'char-1';
const USER_ID = 'user-1';
const CHAT_ID = 'chat-1';

describe('IntelligenceDebugService', () => {
  beforeEach(() => {
    // Singleton — clear state between tests
    intelligenceDebugService.clearDebugData(CHAT_ID);
    intelligenceDebugService.clearDebugData(`${CHAR_ID}-${USER_ID}`);
  });

  // --- recordRetrieval + getDebugState ---
  describe('recordRetrieval', () => {
    it('stores retrieval data visible via getDebugState', () => {
      const results = [
        { id: 'm1', content: 'hello', type: 'fact', score: 0.9, similarity: 0.8, importance: 0.7, recency: 0.6 },
      ];

      intelligenceDebugService.recordRetrieval(CHAR_ID, USER_ID, CHAT_ID, {
        query: 'test query',
        results,
        latencyMs: 42,
      });
      const state = intelligenceDebugService.getDebugState(CHAR_ID, USER_ID, CHAT_ID);

      expect(state.lastRetrieval).not.toBeNull();
      expect(state.lastRetrieval!.query).toBe('test query');
      expect(state.lastRetrieval!.results).toEqual(results);
      expect(state.lastRetrieval!.latencyMs).toBe(42);
      expect(state.lastRetrieval!.timestamp).toBeTruthy();
    });
  });

  // --- recordLatency ---
  describe('recordLatency', () => {
    it('updates the correct metric in performance', () => {
      intelligenceDebugService.recordLatency(CHAR_ID, USER_ID, CHAT_ID, 'embeddingLatency', 100);
      intelligenceDebugService.recordLatency(CHAR_ID, USER_ID, CHAT_ID, 'retrievalLatency', 55);

      const state = intelligenceDebugService.getDebugState(CHAR_ID, USER_ID, CHAT_ID);

      expect(state.performance.embeddingLatency).toBe(100);
      expect(state.performance.retrievalLatency).toBe(55);
      // Others remain at default 0
      expect(state.performance.emotionAnalysisLatency).toBe(0);
      expect(state.performance.promptBuildLatency).toBe(0);
      expect(state.performance.lastPromptTokenCount).toBe(0);
    });
  });

  // --- incrementMessageCounter ---
  describe('incrementMessageCounter', () => {
    it('increments and returns the count on successive calls', () => {
      const c1 = intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, CHAT_ID);
      const c2 = intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, CHAT_ID);
      const c3 = intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, CHAT_ID);

      expect(c1).toBe(1);
      expect(c2).toBe(2);
      expect(c3).toBe(3);

      const state = intelligenceDebugService.getDebugState(CHAR_ID, USER_ID, CHAT_ID);
      expect(state.messageCounter).toBe(3);
    });
  });

  // --- resetMessageCounter ---
  describe('resetMessageCounter', () => {
    it('resets counter to 0 and sets lastExtractedAt', () => {
      intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, CHAT_ID);
      intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, CHAT_ID);

      const before = new Date().toISOString();
      intelligenceDebugService.resetMessageCounter(CHAR_ID, USER_ID, CHAT_ID);

      const state = intelligenceDebugService.getDebugState(CHAR_ID, USER_ID, CHAT_ID);
      expect(state.messageCounter).toBe(0);
      expect(state.memoryStats.lastExtractedAt).toBeTruthy();
      // Timestamp should be recent
      expect(new Date(state.memoryStats.lastExtractedAt!).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });
  // --- getDebugState defaults ---
  describe('getDebugState', () => {
    it('returns zeroed defaults for a new chatId', () => {
      const state = intelligenceDebugService.getDebugState(CHAR_ID, USER_ID, 'brand-new-chat');

      expect(state.lastRetrieval).toBeNull();
      expect(state.messageCounter).toBe(0);
      expect(state.extractionThreshold).toBe(1);
      expect(state.memoryStats.lastExtractedAt).toBeNull();
      expect(state.performance).toEqual({
        embeddingLatency: 0,
        retrievalLatency: 0,
        emotionAnalysisLatency: 0,
        promptBuildLatency: 0,
        lastPromptTokenCount: 0,
      });

      // Clean up
      intelligenceDebugService.clearDebugData('brand-new-chat');
    });
  });

  // --- clearDebugData ---
  describe('clearDebugData', () => {
    it('removes the entry so getDebugState returns fresh defaults', () => {
      intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, CHAT_ID);
      intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, CHAT_ID);
      intelligenceDebugService.recordLatency(CHAR_ID, USER_ID, CHAT_ID, 'embeddingLatency', 999);

      intelligenceDebugService.clearDebugData(CHAT_ID);

      const state = intelligenceDebugService.getDebugState(CHAR_ID, USER_ID, CHAT_ID);
      expect(state.messageCounter).toBe(0);
      expect(state.performance.embeddingLatency).toBe(0);
      expect(state.lastRetrieval).toBeNull();
    });
  });

  // --- chatId fallback key ---
  describe('chatId fallback', () => {
    it('uses characterId-userId as key when chatId is undefined', () => {
      intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, undefined);
      intelligenceDebugService.incrementMessageCounter(CHAR_ID, USER_ID, undefined);

      const state = intelligenceDebugService.getDebugState(CHAR_ID, USER_ID, undefined);
      expect(state.messageCounter).toBe(2);

      // Verify it's stored under the fallback key by clearing it directly
      intelligenceDebugService.clearDebugData(`${CHAR_ID}-${USER_ID}`);
      const stateAfterClear = intelligenceDebugService.getDebugState(CHAR_ID, USER_ID, undefined);
      expect(stateAfterClear.messageCounter).toBe(0);
    });
  });

  // --- getSystemPromptDetails stub ---
  describe('getSystemPromptDetails', () => {
    it('returns null', async () => {
      const result = await intelligenceDebugService.getSystemPromptDetails(CHAR_ID, USER_ID, CHAT_ID);
      expect(result).toBeNull();
    });
  });
});
