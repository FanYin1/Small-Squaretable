/**
 * Recommendation API
 *
 * Handles personalized, trending, and similar character recommendations
 */

import { api } from './api';

export interface RecommendationItem {
  characterId: string;
  score: number;
  source?: string;
}

export interface RecommendationFeedback {
  characterId: string;
  action: string;
  position?: number;
}

export const recommendationApi = {
  /** Personalized recommendations (auth required) */
  getPersonalized: (limit = 20) =>
    api.get<RecommendationItem[]>(`/recommendations?limit=${limit}`),

  /** Public trending characters */
  getTrending: (limit = 20) =>
    api.get<RecommendationItem[]>(`/recommendations/trending?limit=${limit}`),

  /** Similar characters */
  getSimilar: (characterId: string, limit = 10) =>
    api.get<RecommendationItem[]>(`/recommendations/similar/${characterId}?limit=${limit}`),

  /** Track recommendation click */
  sendFeedback: (data: RecommendationFeedback) =>
    api.post('/recommendations/feedback', data),
};
