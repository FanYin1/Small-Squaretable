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
  });
});
