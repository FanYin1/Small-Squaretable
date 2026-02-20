/**
 * ExperimentAnalysisService unit tests
 *
 * Mocks ClickHouse client and logger to test experiment result queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──
const { mockQuery, mockResultSet, mockLoggerError } = vi.hoisted(() => {
  const mockResultSet = {
    json: vi.fn().mockResolvedValue([]),
  };
  const mockQuery = vi.fn().mockResolvedValue(mockResultSet);
  const mockLoggerError = vi.fn();
  return { mockQuery, mockResultSet, mockLoggerError };
});

vi.mock('../../core/clickhouse', () => ({
  getClickHouseClient: vi.fn().mockReturnValue({
    query: mockQuery,
  }),
}));

vi.mock('./logger.service', () => ({
  logger: {
    error: mockLoggerError,
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

import { ExperimentAnalysisService, type VariantMetrics } from './experiment-analysis.service';

describe('ExperimentAnalysisService', () => {
  let service: ExperimentAnalysisService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExperimentAnalysisService();
  });

  describe('getExperimentResults', () => {
    it('should query ClickHouse and return variant metrics', async () => {
      const mockMetrics: VariantMetrics[] = [
        { variant: 'control', impressions: 1000, clicks: 150, chatStarts: 80, ctr: 0.15 },
        { variant: 'treatment', impressions: 1000, clicks: 200, chatStarts: 110, ctr: 0.2 },
      ];
      mockResultSet.json.mockResolvedValueOnce(mockMetrics);

      const result = await service.getExperimentResults('exp-123');

      expect(mockQuery).toHaveBeenCalledOnce();
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query).toContain('dwd_recommendation_events');
      expect(callArgs.query_params).toEqual({ experiment_id: 'exp-123' });
      expect(callArgs.format).toBe('JSONEachRow');
      expect(result).toEqual(mockMetrics);
    });

    it('should return correct structure for single variant', async () => {
      const singleVariant: VariantMetrics[] = [
        { variant: 'control', impressions: 500, clicks: 50, chatStarts: 20, ctr: 0.1 },
      ];
      mockResultSet.json.mockResolvedValueOnce(singleVariant);

      const result = await service.getExperimentResults('exp-single');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('variant', 'control');
      expect(result[0]).toHaveProperty('impressions', 500);
      expect(result[0]).toHaveProperty('clicks', 50);
      expect(result[0]).toHaveProperty('chatStarts', 20);
      expect(result[0]).toHaveProperty('ctr', 0.1);
    });

    it('should return empty array when no results', async () => {
      mockResultSet.json.mockResolvedValueOnce([]);

      const result = await service.getExperimentResults('exp-empty');

      expect(result).toEqual([]);
      expect(mockQuery).toHaveBeenCalledOnce();
    });

    it('should return empty array and log error when ClickHouse throws', async () => {
      const error = new Error('ClickHouse connection refused');
      mockQuery.mockRejectedValueOnce(error);

      const result = await service.getExperimentResults('exp-fail');

      expect(result).toEqual([]);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Failed to query experiment results from ClickHouse',
        error,
        { experimentId: 'exp-fail' },
      );
    });

    it('should pass the experiment id through query_params', async () => {
      mockResultSet.json.mockResolvedValueOnce([]);

      await service.getExperimentResults('my-special-experiment');

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.query_params.experiment_id).toBe('my-special-experiment');
    });
  });
});
