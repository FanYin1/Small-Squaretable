/**
 * Experiment Analysis Service
 *
 * Queries ClickHouse for A/B test experiment results.
 * Returns per-variant metrics: impressions, clicks, chatStarts, CTR.
 */

import { getClickHouseClient } from '../../core/clickhouse';

export interface VariantMetrics {
  variant: string;
  impressions: number;
  clicks: number;
  chatStarts: number;
  ctr: number;
}

export class ExperimentAnalysisService {
  /**
   * Get experiment results grouped by variant and action.
   * Returns empty results if ClickHouse is unavailable.
   */
  async getExperimentResults(experimentId: string): Promise<VariantMetrics[]> {
    try {
      const client = getClickHouseClient();
      const resultSet = await client.query({
        query: `
          SELECT
            variant,
            countIf(action = 'impression') AS impressions,
            countIf(action = 'click') AS clicks,
            countIf(action = 'chat_start') AS chatStarts,
            if(countIf(action = 'impression') > 0,
              round(countIf(action = 'click') / countIf(action = 'impression'), 4),
              0
            ) AS ctr
          FROM analytics.dwd_recommendation_events
          WHERE experiment_id = {experiment_id:String}
          GROUP BY variant
          ORDER BY variant
        `,
        query_params: { experiment_id: experimentId },
        format: 'JSONEachRow',
      });
      return resultSet.json<VariantMetrics>();
    } catch {
      // ClickHouse unavailable — return empty results
      return [];
    }
  }
}

export const experimentAnalysisService = new ExperimentAnalysisService();
