import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryService } from './memory.service';

// Mock dependencies
vi.mock('../../db/repositories/memory.repository', () => ({
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

vi.mock('./embedding.service', () => ({
  embeddingService: {
    embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
  },
}));

vi.mock('./llm.service', () => ({
  llmService: {
    chatCompletion: vi.fn(),
  },
}));

import { memoryRepository } from '../../db/repositories/memory.repository';
import { embeddingService } from './embedding.service';
import { llmService } from './llm.service';

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MemoryService();
  });

  describe('retrieveMemories', () => {
    it('should call hybridSearch with embedding', async () => {
      const mockMemories = [
        { id: '1', content: 'User likes coffee', type: 'fact', score: 0.9 },
      ];
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue(mockMemories as any);

      const result = await service.retrieveMemories({
        characterId: 'char-1',
        userId: 'user-1',
        query: 'What does user like?',
      });

      expect(embeddingService.embed).toHaveBeenCalledWith('What does user like?');
      expect(memoryRepository.hybridSearch).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should update access time for retrieved memories', async () => {
      const mockMemories = [
        { id: 'mem-1', content: 'User likes coffee', type: 'fact', score: 0.9 },
        { id: 'mem-2', content: 'User is a developer', type: 'fact', score: 0.8 },
      ];
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue(mockMemories as any);

      await service.retrieveMemories({
        characterId: 'char-1',
        userId: 'user-1',
        query: 'Tell me about the user',
      });

      expect(memoryRepository.updateAccessTime).toHaveBeenCalledTimes(2);
      expect(memoryRepository.updateAccessTime).toHaveBeenCalledWith('mem-1');
      expect(memoryRepository.updateAccessTime).toHaveBeenCalledWith('mem-2');
    });

    it('should return scored memories with correct structure', async () => {
      const mockMemories = [
        { id: '1', content: 'User likes coffee', type: 'preference', score: 0.9 },
      ];
      vi.mocked(memoryRepository.hybridSearch).mockResolvedValue(mockMemories as any);

      const result = await service.retrieveMemories({
        characterId: 'char-1',
        userId: 'user-1',
        query: 'preferences',
      });

      expect(result[0]).toEqual({
        id: '1',
        content: 'User likes coffee',
        type: 'preference',
        score: 0.9,
      });
    });
  });

  describe('storeMemory', () => {
    it('should create memory and vector', async () => {
      vi.mocked(memoryRepository.create).mockResolvedValue({
        id: 'mem-1',
        content: 'User is a programmer',
      } as any);
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(5);

      await service.storeMemory('char-1', 'user-1', {
        type: 'fact',
        content: 'User is a programmer',
        importance: 0.8,
      });

      expect(memoryRepository.create).toHaveBeenCalled();
      expect(memoryRepository.createVector).toHaveBeenCalled();
      expect(embeddingService.embed).toHaveBeenCalledWith('User is a programmer');
    });

    it('should not store memory when limit is reached', async () => {
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(100);

      await service.storeMemory('char-1', 'user-1', {
        type: 'fact',
        content: 'User is a programmer',
        importance: 0.8,
      });

      expect(memoryRepository.create).not.toHaveBeenCalled();
      expect(memoryRepository.createVector).not.toHaveBeenCalled();
    });

    it('should respect subscription tier limits', async () => {
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(150);
      vi.mocked(memoryRepository.create).mockResolvedValue({
        id: 'mem-1',
        content: 'Test',
      } as any);

      // Free tier (100 limit) - should not store
      await service.storeMemory('char-1', 'user-1', {
        type: 'fact',
        content: 'Test',
        importance: 0.5,
      }, undefined, 'free');
      expect(memoryRepository.create).not.toHaveBeenCalled();

      // Pro tier (500 limit) - should store
      await service.storeMemory('char-1', 'user-1', {
        type: 'fact',
        content: 'Test',
        importance: 0.5,
      }, undefined, 'pro');
      expect(memoryRepository.create).toHaveBeenCalled();
    });

    it('should handle team tier limit', async () => {
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(1500);
      vi.mocked(memoryRepository.create).mockResolvedValue({
        id: 'mem-1',
        content: 'Test',
      } as any);

      // Team tier (2000 limit) - should store
      await service.storeMemory('char-1', 'user-1', {
        type: 'fact',
        content: 'Test',
        importance: 0.5,
      }, undefined, 'team');
      expect(memoryRepository.create).toHaveBeenCalled();
    });

    it('should handle unknown subscription tier as free', async () => {
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(99);
      vi.mocked(memoryRepository.create).mockResolvedValue({
        id: 'mem-1',
        content: 'Test',
      } as any);

      // Unknown tier should default to free (100 limit) - should store
      await service.storeMemory('char-1', 'user-1', {
        type: 'fact',
        content: 'Test',
        importance: 0.5,
      }, undefined, 'unknown' as any);
      expect(memoryRepository.create).toHaveBeenCalled();
    });

    it('should include chatId when provided', async () => {
      vi.mocked(memoryRepository.create).mockResolvedValue({
        id: 'mem-1',
        content: 'Test',
      } as any);
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(0);

      await service.storeMemory('char-1', 'user-1', {
        type: 'fact',
        content: 'Test',
        importance: 0.5,
      }, 'chat-123');

      expect(memoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceChatId: 'chat-123',
        })
      );
    });
  });

  describe('extractMemories', () => {
    it('should extract memories from messages using LLM', async () => {
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
              facts: ['User is a backend developer'],
              preferences: ['Likes TypeScript'],
              relationships: [],
              events: [],
            }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      } as any);

      const messages = [
        { role: 'user', content: 'I work as a backend developer' },
        { role: 'assistant', content: 'That sounds interesting!' },
      ];

      const result = await service.extractMemories('char-1', 'user-1', messages as any);

      expect(llmService.chatCompletion).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('fact');
      expect(result[1].type).toBe('preference');
    });

    it('should return empty array for empty messages', async () => {
      const result = await service.extractMemories('char-1', 'user-1', []);
      expect(result).toEqual([]);
      expect(llmService.chatCompletion).not.toHaveBeenCalled();
    });

    it('should handle LLM errors gracefully', async () => {
      vi.mocked(llmService.chatCompletion).mockRejectedValue(new Error('LLM error'));

      const messages = [
        { role: 'user', content: 'Hello' },
      ];

      const result = await service.extractMemories('char-1', 'user-1', messages as any);
      expect(result).toEqual([]);
    });

    it('should handle invalid JSON response', async () => {
      vi.mocked(llmService.chatCompletion).mockResolvedValue({
        id: 'test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'not valid json',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      } as any);

      const messages = [
        { role: 'user', content: 'Hello' },
      ];

      const result = await service.extractMemories('char-1', 'user-1', messages as any);
      expect(result).toEqual([]);
    });
  });

  describe('deleteMemory', () => {
    it('should delete a memory by id', async () => {
      await service.deleteMemory('mem-1');
      expect(memoryRepository.delete).toHaveBeenCalledWith('mem-1');
    });
  });

  describe('clearAllMemories', () => {
    it('should delete all memories for character and user', async () => {
      await service.clearAllMemories('char-1', 'user-1');
      expect(memoryRepository.deleteAllForCharacterUser).toHaveBeenCalledWith('char-1', 'user-1');
    });
  });

  describe('getMemories', () => {
    it('should get memories for character and user', async () => {
      const mockMemories = [{ id: '1', content: 'Test' }];
      vi.mocked(memoryRepository.findByCharacterAndUser).mockResolvedValue(mockMemories as any);

      const result = await service.getMemories('char-1', 'user-1');

      expect(memoryRepository.findByCharacterAndUser).toHaveBeenCalledWith('char-1', 'user-1', 100);
      expect(result).toEqual(mockMemories);
    });

    it('should respect custom limit', async () => {
      vi.mocked(memoryRepository.findByCharacterAndUser).mockResolvedValue([]);

      await service.getMemories('char-1', 'user-1', 50);

      expect(memoryRepository.findByCharacterAndUser).toHaveBeenCalledWith('char-1', 'user-1', 50);
    });
  });

  describe('getMemoryCount', () => {
    it('should return memory count', async () => {
      vi.mocked(memoryRepository.countByCharacterUser).mockResolvedValue(42);

      const result = await service.getMemoryCount('char-1', 'user-1');

      expect(result).toBe(42);
      expect(memoryRepository.countByCharacterUser).toHaveBeenCalledWith('char-1', 'user-1');
    });
  });
});
