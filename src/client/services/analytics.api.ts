/**
 * Analytics Dashboard API
 *
 * Handles analytics dashboard API requests for overview metrics,
 * retention matrix, conversion funnel, realtime stats, top characters,
 * and user segments.
 */

import { api } from './api';

// ── Response types (mirror backend analytics-query.service.ts) ──

export interface NorthStarMetric {
  week: string;
  tenant_id: string;
  weekly_active_users: number;
  weekly_messages: number;
}

export interface RetentionRow {
  cohort_week: string;
  week_offset: number;
  users: number;
}

export interface FunnelStep {
  step: string;
  users: number;
}

export interface TopCharacter {
  character_id: string;
  total_messages: number;
  total_chat_starts: number;
  avg_rating: number;
}

export interface RealtimeMetrics {
  activeUsers: number;
  eventsPerMin: number;
  messagesPerMin: number;
}

export interface UserSegment {
  segment: string;
  user_count: number;
}

// ── Wrapped response shapes (what `data` contains) ──

export interface OverviewResponse {
  metrics: NorthStarMetric[];
}

export interface RetentionResponse {
  matrix: RetentionRow[];
}

export interface FunnelResponse {
  steps: FunnelStep[];
}

export interface TopCharactersResponse {
  characters: TopCharacter[];
}

export interface SegmentsResponse {
  segments: UserSegment[];
}

// ── API methods ──

export const analyticsApi = {
  /** Fetch north-star overview metrics (weekly active users & messages). */
  getOverview: (weeks?: number) =>
    api.get<OverviewResponse>('/analytics/overview' + (weeks ? `?weeks=${weeks}` : '')),

  /** Fetch week-over-week retention cohort matrix. */
  getRetention: (cohortWeeks?: number) =>
    api.get<RetentionResponse>('/analytics/retention' + (cohortWeeks ? `?cohortWeeks=${cohortWeeks}` : '')),

  /** Fetch conversion funnel steps (visit → signup → first_chat → subscription). */
  getFunnel: (days?: number) =>
    api.get<FunnelResponse>('/analytics/funnel' + (days ? `?days=${days}` : '')),

  /** Fetch realtime metrics from Redis (active users, events/min, messages/min). */
  getRealtime: () =>
    api.get<RealtimeMetrics>('/analytics/realtime'),

  /** Fetch top characters ranked by total messages. */
  getTopCharacters: (limit = 20) =>
    api.get<TopCharactersResponse>(`/analytics/characters/top?limit=${limit}`),

  /** Fetch user segments (power, active, casual, dormant). */
  getSegments: () =>
    api.get<SegmentsResponse>('/analytics/segments'),
};
