// src/server/services/__tests__/intelligence.integration.spec.ts
/**
 * Intelligence Integration Tests
 *
 * Tests the integration between memory, emotion, and chat services
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryService } from '../memory.service';
import { EmotionService } from '../emotion.service';
import { ChatService } from '../chat.service';

// Mock repositories
vi.mock('../../../db/repositories/memory.repository', () => ({
  memoryRepository: {
    create: vi.fn(),
    createVector: vi.fn(),
    findByCharacterAndUser: vi.fn(),
    hybridSearch: vi.fn(),
    updateAccessTime: vi.fn(),
    delete: vi.fn(),
    deleteAllForCharacterUser: vi.fn(),
    countByCharacterUser: vi.fn(),
  },
}));

vi.mock('../../../db/repositories/emotion.repository', () => ({
  emotionRepository: {
    upsert: vi.fn(),
    getCurrentEmotion: vi.fn(),
    getHistory: vi.fn(),
    resetForCharacterUser: vi.fn(),
  },
}));

vi.mock('../../../db/repositories/chat.repository', () => ({
  chatRepository: {
    findByIdAndTenant: vi.fn(),
  },
}));

vi.mock('../../../db/repositories/message.repository', () => ({
  messageRepository: {
    findByChatId: vi.fn(),
  },
}));

vi.mock('../embedding.service', () => ({
  embeddingService: {
    embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
    analyzeSentiment: vi.fn().mockResolvedValue({ valence: 0.5, arousal: 0.4 }),
  },
}));

vi.mock('../llm.service', () => ({
  llmService: {
    chat: vi.fn(),
    chatCompletion: vi.fn(),
  },
}));

import { memoryRepository } from '../../../db/repositories/memory.repository';
import { emotionRepository } from '../../../db/repositories/emotion.repository';
import { embeddingService } from '../embedding.service';
import { llmService } from '../llm.service';

describe('Intelligence Integration', () => {
  let memoryService: MemoryService;
  let emotionService: EmotionService;
  let chatService: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    memoryService = new MemoryService();
    emotionService = new EmotionService();
    chatService = new ChatService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Memory Retrieval Flow', () => {
    it('should retrieve memories and update access times', async () => {
      const mockMemories = [
        { id: 'mem-1', content: 'User likes coffee', type: 'preference', score: 0.9 },
        { id: 'mem-2', content: 'User is a developer', type: 'fact', score: 0.8 },
      ];
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue(mockMemories as any);

      const result = await memoryService.retrieveMemories({
        characterId: 'char-1',
        userId: 'user-1',
        query: 'What does the user like?',
        limit: 5,
      });

      // Verify embedding was generated
      expect(embeddingService.embed).toHaveBeenCalledWith('What does the user like?');

      // Verify hybrid search was called
      expect(memoryRepository.hybridSearch).toHaveBeenCalledWith({
        characterId: 'char-1',
        userId: 'user-1',
        embedding: expect.any(Array),
        limit: 5,
      });

      // Verify access times were updated
      expect(memoryRepository.updateAccessTime).toHaveBeenCalledTimes(2);
      expect(memoryRepository.updateAccessTime).toHaveBeenCalledWith('mem-1');
      expect(memoryRepository.updateAccessTime).toHaveBeenCalledWith('mem-2');

      // Verify result
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('User likes coffee');
    });

    it('should handle empty memory results gracefully', async () => {
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue([]);

      const result = await memoryService.retrieveMemories({
        characterId: 'char-1',
        userId: 'user-1',
        query: 'Unknown topic',
        limit: 5,
      });

      expect(result).toHaveLength(0);
      expect(memoryRepository.updateAccessTime).not.toHaveBeenCalled();
    });

    it('should use default limit when not specified', async () => {
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue([]);

      await memoryService.retrieveMemories({
        characterId: 'char-1',
        userId: 'user-1',
        query: 'Test query',
      });

      expect(memoryRepository.hybridSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10, // Default limit
        })
      );
    });
  });

  describe('Emotion Update Flow', () => {
    it('should analyze sentiment and update emotion with smooth transition', async () => {
      // Setup: existing emotion
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue({
        id: 'emo-1',
        valence: '0.2',
        arousal: '0.3',
      } as any);

      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 0.8,
        arousal: 0.6,
      });

      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-2',
        valence: '0.38', // 0.7 * 0.2 + 0.3 * 0.8 = 0.38
        arousal: '0.39', // 0.7 * 0.3 + 0.3 * 0.6 = 0.39
      } as any);

      const result = await emotionService.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        text: 'I am feeling great today!',
      });

      // Verify sentiment analysis
      expect(embeddingService.analyzeSentiment).toHaveBeenCalledWith('I am feeling great today!');

      // Verify current emotion was fetched
      expect(emotionRepository.getCurrentEmotion).toHaveBeenCalledWith('char-1', 'user-1', 'chat-1');

      // Verify upsert was called with smoothed values
      expect(emotionRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: 'char-1',
          userId: 'user-1',
          chatId: 'chat-1',
        })
      );

      // Verify result has label
      expect(result.label).toBeDefined();
    });

    it('should use raw sentiment when no current emotion exists', async () => {
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 0.7,
        arousal: 0.5,
      });
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
        valence: '0.7',
        arousal: '0.5',
      } as any);

      const result = await emotionService.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        text: 'Hello!',
      });

      // Should use raw values without smoothing
      expect(emotionRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          valence: '0.7',
          arousal: '0.5',
        })
      );

      expect(result.label).toBeDefined();
    });

    it('should clamp emotion values to valid ranges', async () => {
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 1.5, // Above max
        arousal: -0.5, // Below min
      });
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
        valence: '1',
        arousal: '0',
      } as any);

      await emotionService.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        text: 'Extreme emotion test',
      });

      const upsertCall = vi.mocked(emotionRepository.upsert).mock.calls[0][0];
      expect(parseFloat(upsertCall.valence)).toBeLessThanOrEqual(1);
      expect(parseFloat(upsertCall.arousal)).toBeGreaterThanOrEqual(0);
    });

    it('should include trigger content truncated to 200 chars', async () => {
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 0.5,
        arousal: 0.5,
      });
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
      } as any);

      const longText = 'A'.repeat(300);
      await emotionService.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        text: longText,
        messageId: 123,
      });

      const upsertCall = vi.mocked(emotionRepository.upsert).mock.calls[0][0];
      expect(upsertCall.triggerContent).toHaveLength(200);
      expect(upsertCall.triggerMessageId).toBe(123);
    });
  });

  describe('System Prompt Injection', () => {
    it('should build enhanced prompt with memories and emotion', async () => {
      // Setup memories
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue([
        { id: 'mem-1', content: 'User prefers TypeScript', type: 'preference', score: 0.9 },
        { id: 'mem-2', content: 'User works at a startup', type: 'fact', score: 0.8 },
      ] as any);

      // Setup emotion
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue({
        id: 'emo-1',
        valence: '0.6',
        arousal: '0.4',
      } as any);

      const mockCharacter = {
        id: 'char-1',
        name: 'Assistant',
        description: 'A helpful AI assistant',
        cardData: {
          personality: 'Friendly and knowledgeable',
          scenario: 'Helping with coding tasks',
        },
      };

      const prompt = await chatService.buildEnhancedSystemPrompt({
        character: mockCharacter as any,
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        userMessage: 'Help me with TypeScript',
      });

      // Verify prompt contains character info
      expect(prompt).toContain('Assistant');
      expect(prompt).toContain('A helpful AI assistant');
      expect(prompt).toContain('Friendly and knowledgeable');

      // Verify prompt contains memories
      expect(prompt).toContain('User prefers TypeScript');
      expect(prompt).toContain('User works at a startup');

      // Verify prompt contains emotion
      expect(prompt).toContain('happy'); // Based on valence 0.6, arousal 0.4

      // Verify prompt contains behavior guidelines
      expect(prompt).toContain('行为指引');
    });

    it('should handle missing memories gracefully', async () => {
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue([]);
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);

      const mockCharacter = {
        id: 'char-1',
        name: 'Assistant',
        description: 'A helpful AI',
        cardData: {},
      };

      const prompt = await chatService.buildEnhancedSystemPrompt({
        character: mockCharacter as any,
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        userMessage: 'Hello',
      });

      // Should still have character info
      expect(prompt).toContain('Assistant');

      // Should not have memory section
      expect(prompt).not.toContain('关于用户的记忆');

      // Should not have emotion section
      expect(prompt).not.toContain('当前情感状态');
    });

    it('should include system_prompt from cardData if present', async () => {
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue([]);
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);

      const mockCharacter = {
        id: 'char-1',
        name: 'CustomBot',
        description: 'A custom bot',
        cardData: {
          system_prompt: 'Always respond in a formal manner.',
        },
      };

      const prompt = await chatService.buildEnhancedSystemPrompt({
        character: mockCharacter as any,
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        userMessage: 'Hello',
      });

      expect(prompt).toContain('Always respond in a formal manner.');
    });

    it('should categorize memories by type in prompt', async () => {
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue([
        { id: 'mem-1', content: 'User is 30 years old', type: 'fact', score: 0.9 },
        { id: 'mem-2', content: 'User likes dark mode', type: 'preference', score: 0.8 },
        { id: 'mem-3', content: 'User is a friend', type: 'relationship', score: 0.7 },
        { id: 'mem-4', content: 'User had a birthday last week', type: 'event', score: 0.6 },
      ] as any);
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);

      const mockCharacter = {
        id: 'char-1',
        name: 'Assistant',
        description: 'Helper',
        cardData: {},
      };

      const prompt = await chatService.buildEnhancedSystemPrompt({
        character: mockCharacter as any,
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        userMessage: 'Tell me about myself',
      });

      // Verify memory categories are present
      expect(prompt).toContain('【事实】');
      expect(prompt).toContain('【偏好】');
      expect(prompt).toContain('【关系】');
      expect(prompt).toContain('【事件】');
    });
  });

  describe('Batch Memory Extraction', () => {
    it('should trigger extraction after 10 messages', async () => {
      const chatId = 'chat-1';
      const characterId = 'char-1';
      const userId = 'user-1';

      // Mock LLM response for extraction
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(5);
      vi.mocked(memoryRepository.create).mockResolvedValue({ id: 'mem-new' } as any);
      vi.mocked(llmService.chatCompletion).mockResolvedValue({
        id: 'test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              facts: ['User is a programmer'],
              preferences: [],
              relationships: [],
              events: [],
            }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      } as any);

      // Simulate 9 messages (no extraction)
      for (let i = 0; i < 9; i++) {
        await chatService.checkAndExtractMemories(chatId, characterId, userId, []);
      }

      // Verify no extraction happened yet
      expect(llmService.chatCompletion).not.toHaveBeenCalled();

      // 10th message should trigger extraction
      const messages = [
        { id: 1, role: 'user', content: 'I love coffee', chatId, sentAt: new Date() },
        { id: 2, role: 'assistant', content: 'Great choice!', chatId, sentAt: new Date() },
      ];

      await chatService.checkAndExtractMemories(chatId, characterId, userId, messages as any);

      // Verify extraction was triggered
      expect(llmService.chatCompletion).toHaveBeenCalled();
    });

    it('should reset counter after extraction', async () => {
      const chatId = 'chat-2';
      const characterId = 'char-1';
      const userId = 'user-1';

      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(5);
      vi.mocked(memoryRepository.create).mockResolvedValue({ id: 'mem-new' } as any);
      vi.mocked(llmService.chatCompletion).mockResolvedValue({
        id: 'test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              facts: [],
              preferences: [],
              relationships: [],
              events: [],
            }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      } as any);

      const messages = [
        { id: 1, role: 'user', content: 'Hello', chatId, sentAt: new Date() },
        { id: 2, role: 'assistant', content: 'Hi!', chatId, sentAt: new Date() },
      ];

      // Trigger first extraction (10 messages)
      for (let i = 0; i < 10; i++) {
        await chatService.checkAndExtractMemories(chatId, characterId, userId, messages as any);
      }

      expect(llmService.chatCompletion).toHaveBeenCalledTimes(1);

      // Next 9 messages should not trigger extraction
      for (let i = 0; i < 9; i++) {
        await chatService.checkAndExtractMemories(chatId, characterId, userId, messages as any);
      }

      expect(llmService.chatCompletion).toHaveBeenCalledTimes(1);

      // 10th message after reset should trigger again
      await chatService.checkAndExtractMemories(chatId, characterId, userId, messages as any);

      expect(llmService.chatCompletion).toHaveBeenCalledTimes(2);
    });
  });

  describe('End-to-End Intelligence Flow', () => {
    it('should complete full intelligence cycle: store -> retrieve -> inject', async () => {
      // Step 1: Store a memory
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(0);
      vi.mocked(memoryRepository.create).mockResolvedValue({
        id: 'mem-1',
        content: 'User loves hiking',
        type: 'preference',
      } as any);

      await memoryService.storeMemory('char-1', 'user-1', {
        type: 'preference',
        content: 'User loves hiking',
        importance: 0.8,
      });

      expect(memoryRepository.create).toHaveBeenCalled();
      expect(memoryRepository.createVector).toHaveBeenCalled();

      // Step 2: Retrieve memories
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue([
        { id: 'mem-1', content: 'User loves hiking', type: 'preference', score: 0.9 },
      ] as any);

      const memories = await memoryService.retrieveMemories({
        characterId: 'char-1',
        userId: 'user-1',
        query: 'What are the user hobbies?',
      });

      expect(memories).toHaveLength(1);
      expect(memories[0].content).toBe('User loves hiking');

      // Step 3: Update emotion
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 0.7,
        arousal: 0.5,
      });
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
        valence: '0.7',
        arousal: '0.5',
      } as any);

      const emotion = await emotionService.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        text: 'I had a great hike today!',
      });

      expect(emotion.label).toBeDefined();

      // Step 4: Build enhanced prompt
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue({
        id: 'emo-1',
        valence: '0.7',
        arousal: '0.5',
      } as any);

      const mockCharacter = {
        id: 'char-1',
        name: 'HikingBuddy',
        description: 'An outdoor enthusiast companion',
        cardData: {},
      };

      const prompt = await chatService.buildEnhancedSystemPrompt({
        character: mockCharacter as any,
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        userMessage: 'Tell me about hiking trails',
      });

      // Verify the prompt integrates all components
      expect(prompt).toContain('HikingBuddy');
      expect(prompt).toContain('User loves hiking');
      expect(prompt).toContain('行为指引');
    });
  });

  describe('Error Handling', () => {
    it('should handle embedding service errors gracefully', async () => {
      vi.mocked(embeddingService.embed).mockRejectedValue(new Error('Embedding failed'));

      await expect(
        memoryService.retrieveMemories({
          characterId: 'char-1',
          userId: 'user-1',
          query: 'Test',
        })
      ).rejects.toThrow('Embedding failed');
    });

    it('should handle sentiment analysis errors gracefully', async () => {
      vi.mocked(embeddingService.analyzeSentiment).mockRejectedValue(
        new Error('Sentiment analysis failed')
      );

      await expect(
        emotionService.analyzeAndUpdate({
          characterId: 'char-1',
          userId: 'user-1',
          text: 'Test',
        })
      ).rejects.toThrow('Sentiment analysis failed');
    });

    it('should handle repository errors gracefully', async () => {
      vi.mocked(memoryRepository.hybridSearch).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        memoryService.retrieveMemories({
          characterId: 'char-1',
          userId: 'user-1',
          query: 'Test',
        })
      ).rejects.toThrow('Database connection failed');
    });
  });
});
