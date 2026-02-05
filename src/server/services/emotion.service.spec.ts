// src/server/services/emotion.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmotionService, EMOTION_MAP } from './emotion.service';

vi.mock('../../db/repositories/emotion.repository', () => ({
  emotionRepository: {
    upsert: vi.fn(),
    getCurrentEmotion: vi.fn(),
    getHistory: vi.fn(),
    resetForCharacterUser: vi.fn(),
  },
}));

vi.mock('./embedding.service', () => ({
  embeddingService: {
    analyzeSentiment: vi.fn(),
  },
}));

import { emotionRepository } from '../../db/repositories/emotion.repository';
import { embeddingService } from './embedding.service';

describe('EmotionService', () => {
  let service: EmotionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmotionService();
  });

  describe('getEmotionLabel', () => {
    it('should return "happy" for positive valence and medium arousal', () => {
      const label = service.getEmotionLabel(0.5, 0.5);
      expect(label).toBe('happy');
    });

    it('should return "angry" for negative valence and high arousal', () => {
      const label = service.getEmotionLabel(-0.7, 0.8);
      expect(label).toBe('angry');
    });

    it('should return "calm" for neutral valence and low arousal', () => {
      const label = service.getEmotionLabel(0.2, 0.1);
      expect(label).toBe('calm');
    });
  });

  describe('smoothTransition', () => {
    it('should blend current and new emotion', () => {
      const current = { valence: 0.5, arousal: 0.5 };
      const newEmotion = { valence: -0.5, arousal: 0.8 };

      const result = service.smoothTransition(current, newEmotion);

      // 0.7 * 0.5 + 0.3 * (-0.5) = 0.35 - 0.15 = 0.2
      expect(result.valence).toBeCloseTo(0.2, 1);
      // 0.7 * 0.5 + 0.3 * 0.8 = 0.35 + 0.24 = 0.59
      expect(result.arousal).toBeCloseTo(0.59, 1);
    });
  });

  describe('analyzeAndUpdate', () => {
    it('should analyze text and update emotion', async () => {
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 0.6,
        arousal: 0.4,
      });
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
        valence: '0.6',
        arousal: '0.4',
      } as any);

      const result = await service.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        text: 'I am feeling great!',
      });

      expect(embeddingService.analyzeSentiment).toHaveBeenCalledWith('I am feeling great!');
      expect(emotionRepository.upsert).toHaveBeenCalled();
      expect(result.label).toBeDefined();
    });

    it('should use smooth transition when current emotion exists', async () => {
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: -0.5,
        arousal: 0.8,
      });
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue({
        valence: '0.5',
        arousal: '0.5',
      } as any);
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
      } as any);

      await service.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        text: 'I am angry!',
      });

      expect(emotionRepository.upsert).toHaveBeenCalled();
      const upsertCall = vi.mocked(emotionRepository.upsert).mock.calls[0][0];
      // Should be a blend of current (0.5, 0.5) and new (-0.5, 0.8)
      // valence: 0.5 * 0.7 + (-0.5) * 0.3 = 0.35 - 0.15 = 0.2
      // arousal: 0.5 * 0.7 + 0.8 * 0.3 = 0.35 + 0.24 = 0.59
      expect(parseFloat(upsertCall.valence)).toBeCloseTo(0.2, 1);
      expect(parseFloat(upsertCall.arousal)).toBeCloseTo(0.59, 1);
    });

    it('should handle null current emotion gracefully', async () => {
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 0.5,
        arousal: 0.5,
      });
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
      } as any);

      const result = await service.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        text: 'Test',
      });

      expect(result.label).toBeDefined();
    });

    it('should clamp values to valid ranges after transition', async () => {
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 1.5, // Above max
        arousal: -0.5, // Below min
      });
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
      } as any);

      await service.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        text: 'Test',
      });

      const upsertCall = vi.mocked(emotionRepository.upsert).mock.calls[0][0];
      expect(parseFloat(upsertCall.valence)).toBeLessThanOrEqual(1);
      expect(parseFloat(upsertCall.arousal)).toBeGreaterThanOrEqual(0);
    });

    it('should include messageId and triggerContent in upsert', async () => {
      vi.mocked(embeddingService.analyzeSentiment).mockResolvedValue({
        valence: 0.5,
        arousal: 0.5,
      });
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);
      vi.mocked(emotionRepository.upsert).mockResolvedValue({
        id: 'emo-1',
      } as any);

      await service.analyzeAndUpdate({
        characterId: 'char-1',
        userId: 'user-1',
        chatId: 'chat-1',
        text: 'This is a test message that is longer than two hundred characters. '.repeat(10),
        messageId: 123,
      });

      const upsertCall = vi.mocked(emotionRepository.upsert).mock.calls[0][0];
      expect(upsertCall.triggerMessageId).toBe(123);
      expect(upsertCall.triggerContent).toHaveLength(200);
    });

    it('should handle sentiment analysis errors', async () => {
      vi.mocked(embeddingService.analyzeSentiment).mockRejectedValue(
        new Error('Sentiment analysis failed')
      );

      await expect(
        service.analyzeAndUpdate({
          characterId: 'char-1',
          userId: 'user-1',
          chatId: 'chat-1',
          text: 'Test',
        })
      ).rejects.toThrow('Sentiment analysis failed');
    });
  });

  describe('getEmotionLabel - boundary values', () => {
    it('should return "excited" for maximum positive valence and arousal', () => {
      const label = service.getEmotionLabel(1, 1);
      expect(label).toBe('excited');
    });

    it('should return "angry" for minimum valence and high arousal', () => {
      const label = service.getEmotionLabel(-1, 0.8);
      expect(label).toBe('angry');
    });

    it('should return "calm" for neutral valence and minimum arousal', () => {
      // (0, 0) falls in 'bored' range, so test for actual calm range
      const label = service.getEmotionLabel(0.25, 0.15);
      expect(label).toBe('calm');
    });

    it('should return "sad" for negative valence and low arousal', () => {
      const label = service.getEmotionLabel(-0.5, 0.2);
      expect(label).toBe('sad');
    });

    it('should return "fearful" for negative valence and high arousal', () => {
      const label = service.getEmotionLabel(-0.5, 0.7);
      expect(label).toBe('fearful');
    });

    it('should return "loving" for positive valence and low-medium arousal', () => {
      const label = service.getEmotionLabel(0.7, 0.3);
      expect(label).toBe('loving');
    });

    it('should return "curious" for slightly positive valence and medium arousal', () => {
      const label = service.getEmotionLabel(0.3, 0.5);
      expect(label).toBe('curious');
    });

    it('should return "bored" for slightly negative valence and low arousal', () => {
      const label = service.getEmotionLabel(-0.1, 0.1);
      expect(label).toBe('bored');
    });

    it('should return "disgusted" for very negative valence and medium arousal', () => {
      const label = service.getEmotionLabel(-0.8, 0.5);
      expect(label).toBe('disgusted');
    });

    it('should return "surprised" for slightly negative to positive valence and high arousal', () => {
      const label = service.getEmotionLabel(0.1, 0.8);
      expect(label).toBe('surprised');
    });

    it('should return "confused" for near-zero valence and medium arousal', () => {
      const label = service.getEmotionLabel(-0.1, 0.5);
      expect(label).toBe('confused');
    });

    it('should return default "calm" for values not matching any region', () => {
      const label = service.getEmotionLabel(0.25, 0.25);
      expect(label).toBe('calm');
    });
  });

  describe('smoothTransition', () => {
    it('should blend current and new emotion', () => {
      const current = { valence: 0.5, arousal: 0.5 };
      const newEmotion = { valence: -0.5, arousal: 0.8 };

      const result = service.smoothTransition(current, newEmotion);

      // 0.7 * 0.5 + 0.3 * (-0.5) = 0.35 - 0.15 = 0.2
      expect(result.valence).toBeCloseTo(0.2, 1);
      // 0.7 * 0.5 + 0.3 * 0.8 = 0.35 + 0.24 = 0.59
      expect(result.arousal).toBeCloseTo(0.59, 1);
    });

    it('should weigh current emotion higher (70%)', () => {
      const current = { valence: 1, arousal: 1 };
      const newEmotion = { valence: 0, arousal: 0 };

      const result = service.smoothTransition(current, newEmotion);

      expect(result.valence).toBeCloseTo(0.7, 2);
      expect(result.arousal).toBeCloseTo(0.7, 2);
    });

    it('should handle zero current emotion', () => {
      const current = { valence: 0, arousal: 0 };
      const newEmotion = { valence: 0.5, arousal: 0.5 };

      const result = service.smoothTransition(current, newEmotion);

      expect(result.valence).toBeCloseTo(0.15, 2);
      expect(result.arousal).toBeCloseTo(0.15, 2);
    });
  });

  describe('getCurrentEmotion', () => {
    it('should return null when no emotion exists', async () => {
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);

      const result = await service.getCurrentEmotion('char-1', 'user-1');

      expect(result).toBeNull();
    });

    it('should return emotion state with label', async () => {
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue({
        id: 'emo-1',
        valence: '0.6',
        arousal: '0.4',
        characterId: 'char-1',
        userId: 'user-1',
      } as any);

      const result = await service.getCurrentEmotion('char-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result!.valence).toBe(0.6);
      expect(result!.arousal).toBe(0.4);
      expect(result!.label).toBe('happy');
      expect(result!.description).toContain('happy');
    });

    it('should pass chatId to repository', async () => {
      vi.mocked(emotionRepository.getCurrentEmotion).mockResolvedValue(null);

      await service.getCurrentEmotion('char-1', 'user-1', 'chat-1');

      expect(emotionRepository.getCurrentEmotion).toHaveBeenCalledWith(
        'char-1',
        'user-1',
        'chat-1'
      );
    });
  });

  describe('getEmotionHistory', () => {
    it('should get emotion history from repository', async () => {
      const mockHistory = [
        { id: 'emo-1', valence: '0.5', arousal: '0.5' },
        { id: 'emo-2', valence: '-0.3', arousal: '0.7' },
      ];
      vi.mocked(emotionRepository.getHistory).mockResolvedValue(mockHistory as any);

      const result = await service.getEmotionHistory('char-1', 'user-1', 50);

      expect(result).toEqual(mockHistory);
      expect(emotionRepository.getHistory).toHaveBeenCalledWith('char-1', 'user-1', 50);
    });

    it('should use default limit of 50', async () => {
      vi.mocked(emotionRepository.getHistory).mockResolvedValue([]);

      await service.getEmotionHistory('char-1', 'user-1');

      expect(emotionRepository.getHistory).toHaveBeenCalledWith('char-1', 'user-1', 50);
    });
  });

  describe('resetEmotion', () => {
    it('should reset emotion for character and user', async () => {
      vi.mocked(emotionRepository.resetForCharacterUser).mockResolvedValue(undefined);

      await service.resetEmotion('char-1', 'user-1');

      expect(emotionRepository.resetForCharacterUser).toHaveBeenCalledWith('char-1', 'user-1');
    });
  });
});
