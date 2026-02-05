// src/server/services/emotion.service.ts
/**
 * Emotion Service
 *
 * Manages character emotional state using 2D Valence-Arousal model
 */

import { emotionRepository } from '../../db/repositories/emotion.repository';
import { embeddingService } from './embedding.service';
import type { CharacterEmotion } from '../../db/schema/emotions';

export interface EmotionState {
  valence: number;
  arousal: number;
  label: string;
  description: string;
}

interface EmotionLabel {
  name: string;
  valence: [number, number]; // [min, max]
  arousal: [number, number]; // [min, max]
}

export const EMOTION_MAP: EmotionLabel[] = [
  { name: 'excited', valence: [0.5, 1], arousal: [0.7, 1] },
  { name: 'happy', valence: [0.3, 0.8], arousal: [0.3, 0.7] },
  { name: 'loving', valence: [0.5, 1], arousal: [0.2, 0.5] },
  { name: 'calm', valence: [0, 0.5], arousal: [0, 0.3] },
  { name: 'curious', valence: [0.1, 0.5], arousal: [0.4, 0.7] },
  { name: 'surprised', valence: [-0.2, 0.5], arousal: [0.6, 1] },
  { name: 'confused', valence: [-0.3, 0.1], arousal: [0.3, 0.6] },
  { name: 'bored', valence: [-0.3, 0], arousal: [0, 0.3] },
  { name: 'sad', valence: [-0.8, -0.2], arousal: [0, 0.4] },
  { name: 'fearful', valence: [-0.7, -0.2], arousal: [0.5, 0.9] },
  { name: 'angry', valence: [-1, -0.4], arousal: [0.6, 1] },
  { name: 'disgusted', valence: [-0.9, -0.4], arousal: [0.3, 0.7] },
];

export interface AnalyzeParams {
  characterId: string;
  userId: string;
  chatId?: string;
  text: string;
  messageId?: number;
}

export class EmotionService {
  getEmotionLabel(valence: number, arousal: number): string {
    // Find best matching emotion
    let bestMatch = 'calm';
    let bestScore = -Infinity;

    for (const emotion of EMOTION_MAP) {
      const vInRange = valence >= emotion.valence[0] && valence <= emotion.valence[1];
      const aInRange = arousal >= emotion.arousal[0] && arousal <= emotion.arousal[1];

      if (vInRange && aInRange) {
        // Calculate how centered the point is in the range
        const vCenter = (emotion.valence[0] + emotion.valence[1]) / 2;
        const aCenter = (emotion.arousal[0] + emotion.arousal[1]) / 2;
        const score = -Math.sqrt(Math.pow(valence - vCenter, 2) + Math.pow(arousal - aCenter, 2));

        if (score > bestScore) {
          bestScore = score;
          bestMatch = emotion.name;
        }
      }
    }

    return bestMatch;
  }

  smoothTransition(
    current: { valence: number; arousal: number },
    newEmotion: { valence: number; arousal: number }
  ): { valence: number; arousal: number } {
    return {
      valence: current.valence * 0.7 + newEmotion.valence * 0.3,
      arousal: current.arousal * 0.7 + newEmotion.arousal * 0.3,
    };
  }

  async analyzeAndUpdate(params: AnalyzeParams): Promise<EmotionState> {
    const { characterId, userId, chatId, text, messageId } = params;

    // Analyze sentiment
    const sentiment = await embeddingService.analyzeSentiment(text);

    // Get current emotion for smooth transition
    const current = await emotionRepository.getCurrentEmotion(characterId, userId, chatId);

    let finalEmotion = sentiment;
    if (current) {
      finalEmotion = this.smoothTransition(
        { valence: Number(current.valence), arousal: Number(current.arousal) },
        sentiment
      );
    }

    // Clamp values
    finalEmotion.valence = Math.max(-1, Math.min(1, finalEmotion.valence));
    finalEmotion.arousal = Math.max(0, Math.min(1, finalEmotion.arousal));

    // Save to database
    await emotionRepository.upsert({
      characterId,
      userId,
      chatId,
      valence: String(finalEmotion.valence),
      arousal: String(finalEmotion.arousal),
      triggerMessageId: messageId,
      triggerContent: text.substring(0, 200),
    });

    const label = this.getEmotionLabel(finalEmotion.valence, finalEmotion.arousal);

    return {
      valence: finalEmotion.valence,
      arousal: finalEmotion.arousal,
      label,
      description: `Current emotion: ${label}`,
    };
  }

  async getCurrentEmotion(
    characterId: string,
    userId: string,
    chatId?: string
  ): Promise<EmotionState | null> {
    const emotion = await emotionRepository.getCurrentEmotion(characterId, userId, chatId);
    if (!emotion) return null;

    const valence = Number(emotion.valence);
    const arousal = Number(emotion.arousal);
    const label = this.getEmotionLabel(valence, arousal);

    return {
      valence,
      arousal,
      label,
      description: `Current emotion: ${label}`,
    };
  }

  async getEmotionHistory(
    characterId: string,
    userId: string,
    limit = 50
  ): Promise<CharacterEmotion[]> {
    return await emotionRepository.getHistory(characterId, userId, limit);
  }

  async resetEmotion(characterId: string, userId: string): Promise<void> {
    await emotionRepository.resetForCharacterUser(characterId, userId);
  }
}

export const emotionService = new EmotionService();
