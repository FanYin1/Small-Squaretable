/**
 * AnalyticsQueryService unit tests
 *
 * Mocks ClickHouse client and Redis to test each analytics query method.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const { mockQuery, mockResultSet, mockRedisGet, mockRedisClient } = vi.hoisted(() => {
  const mockResultSet = {
    json: vi.fn().mockResolvedValue([]),
  };
  const mockQuery = vi.fn().mockResolvedValue(mockResultSet);
  const mockRedisGet = vi.fn().mockResolvedValue(null);
  const mockRedisClient = { get: mockRedisGet };
  return { mockQuery, mockResultSet, mockRedisGet, mockRedisClient };
});

vi.mock('../../core/clickhouse', () => ({
  getClickHouseClient: vi.fn().mockReturnValue({
    query: mockQuery,
  }),
}));

vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue(mockRedisClient),
}));

import { AnalyticsQueryService } from './analytics-query.service';

describe('AnalyticsQueryService', () => {
  let service: AnalyticsQueryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsQueryService();
  });

  // ── getNorthStarMetrics ──
  describe('getNorthStarMetrics', () => {
    it('should query ads_north_star view and return typed results', async () => {
      const mockData = [
        { week: '2026-02-03', tenant_id: 't1', weekly_active_users: 120, weekly_messages: 5400 },
        { week: '2026-01-27', tenant_id: 't1', weekly_active_users: 105, weekly_messages: 4800 },
      ];
      mockResultSet.json.mockResolvedValueOnce(mockData);

      const result = await service.getNorthStarMetrics('t1', 4);

      expect(mockQuery).toHaveBeenCalledOnce();
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query).toContain('ads_north_star');
      expect(callArgs.query_params.tenant_id).toBe('t1');
      expect(callArgs.query_params.weeks).toBe(4);
      expect(callArgs.format).toBe('JSONEachRow');
      expect(result).toEqual(mockData);
    });

    it('should default to 12 weeks when not specified', async () => {
      mockResultSet.json.mockResolvedValueOnce([]);

      await service.getNorthStarMetrics('t1');

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query_params.weeks).toBe(12);
    });
  });

  // ── getRetentionMatrix ──
  describe('getRetentionMatrix', () => {
    it('should query dws_user_hourly for week-over-week retention', async () => {
      const mockData = [
        { cohort_week: '2026-01-06', week_offset: 0, users: 50 },
        { cohort_week: '2026-01-06', week_offset: 1, users: 30 },
      ];
      mockResultSet.json.mockResolvedValueOnce(mockData);

      const result = await service.getRetentionMatrix('t1', 8);

      expect(mockQuery).toHaveBeenCalledOnce();
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query).toContain('dws_user_hourly');
      expect(callArgs.query_params.tenant_id).toBe('t1');
      expect(callArgs.query_params.cohort_weeks).toBe(8);
      expect(callArgs.format).toBe('JSONEachRow');
      expect(result).toEqual(mockData);
    });

    it('should default to 8 cohort weeks', async () => {
      mockResultSet.json.mockResolvedValueOnce([]);

      await service.getRetentionMatrix('t1');

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query_params.cohort_weeks).toBe(8);
    });
  });

  // ── getConversionFunnel ──
  describe('getConversionFunnel', () => {
    it('should query ods_events for funnel steps', async () => {
      const mockData = [
        { step: 'visit', users: 1000 },
        { step: 'signup', users: 300 },
        { step: 'first_chat', users: 150 },
        { step: 'subscription', users: 40 },
      ];
      mockResultSet.json.mockResolvedValueOnce(mockData);

      const result = await service.getConversionFunnel('t1', 30);

      expect(mockQuery).toHaveBeenCalledOnce();
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query).toContain('ods_events');
      expect(callArgs.query_params.tenant_id).toBe('t1');
      expect(callArgs.query_params.days).toBe(30);
      expect(callArgs.format).toBe('JSONEachRow');
      expect(result).toEqual(mockData);
    });

    it('should default to 30 days', async () => {
      mockResultSet.json.mockResolvedValueOnce([]);

      await service.getConversionFunnel('t1');

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query_params.days).toBe(30);
    });
  });

  // ── getTopCharacters ──
  describe('getTopCharacters', () => {
    it('should query dws_character_daily for top characters by messages', async () => {
      const mockData = [
        { character_id: 'c1', total_messages: 500, total_chat_starts: 80, avg_rating: 4.5 },
        { character_id: 'c2', total_messages: 320, total_chat_starts: 60, avg_rating: 4.2 },
      ];
      mockResultSet.json.mockResolvedValueOnce(mockData);

      const result = await service.getTopCharacters('t1', 10);

      expect(mockQuery).toHaveBeenCalledOnce();
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query).toContain('dws_character_daily');
      expect(callArgs.query_params.tenant_id).toBe('t1');
      expect(callArgs.query_params.limit).toBe(10);
      expect(callArgs.format).toBe('JSONEachRow');
      expect(result).toEqual(mockData);
    });

    it('should default to 20 characters', async () => {
      mockResultSet.json.mockResolvedValueOnce([]);

      await service.getTopCharacters('t1');

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query_params.limit).toBe(20);
    });
  });

  // ── getRealtimeMetrics ──
  describe('getRealtimeMetrics', () => {
    it('should read realtime metrics from Redis keys', async () => {
      mockRedisGet
        .mockResolvedValueOnce('42')   // active_users
        .mockResolvedValueOnce('128')  // events_per_min
        .mockResolvedValueOnce('35');  // messages_per_min

      const result = await service.getRealtimeMetrics('t1');

      expect(mockRedisGet).toHaveBeenCalledTimes(3);
      expect(mockRedisGet).toHaveBeenCalledWith('rt:t1:active_users');
      expect(mockRedisGet).toHaveBeenCalledWith('rt:t1:events_per_min');
      expect(mockRedisGet).toHaveBeenCalledWith('rt:t1:messages_per_min');
      expect(result).toEqual({
        activeUsers: 42,
        eventsPerMin: 128,
        messagesPerMin: 35,
      });
    });

    it('should return 0 for missing Redis keys', async () => {
      mockRedisGet
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.getRealtimeMetrics('t1');

      expect(result).toEqual({
        activeUsers: 0,
        eventsPerMin: 0,
        messagesPerMin: 0,
      });
    });
  });

  // ── getUserSegments ──
  describe('getUserSegments', () => {
    it('should query dws_user_hourly to segment users by activity level', async () => {
      const mockData = [
        { segment: 'power', user_count: 15 },
        { segment: 'active', user_count: 80 },
        { segment: 'casual', user_count: 200 },
        { segment: 'dormant', user_count: 350 },
      ];
      mockResultSet.json.mockResolvedValueOnce(mockData);

      const result = await service.getUserSegments('t1');

      expect(mockQuery).toHaveBeenCalledOnce();
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query).toContain('dws_user_hourly');
      expect(callArgs.query_params.tenant_id).toBe('t1');
      expect(callArgs.format).toBe('JSONEachRow');
      expect(result).toEqual(mockData);
    });
  });
});
