/**
 * Analytics Query Service
 *
 * Queries ClickHouse ADS/DWS views for dashboard data:
 * north star metrics, retention matrix, funnel analysis,
 * character rankings, user segments.
 *
 * Realtime metrics are read from Redis keys written by Flink.
 */

import { getClickHouseClient } from '../../core/clickhouse';
import { getRedisClient } from '../../core/redis';

// ── Result types ──

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

// ── Service ──

export class AnalyticsQueryService {
  /**
   * Query north star metrics from the ADS view.
   * Returns weekly active users and message counts per week.
   */
  async getNorthStarMetrics(tenantId: string, weeks = 12): Promise<NorthStarMetric[]> {
    const client = getClickHouseClient();
    const resultSet = await client.query({
      query: `
        SELECT week, tenant_id, weekly_active_users, weekly_messages
        FROM analytics.ads_north_star
        WHERE tenant_id = {tenant_id:String}
        ORDER BY week DESC
        LIMIT {weeks:UInt32}
      `,
      query_params: { tenant_id: tenantId, weeks },
      format: 'JSONEachRow',
    });
    return resultSet.json<NorthStarMetric>();
  }

  /**
   * Compute week-over-week retention matrix from dws_user_hourly.
   * Groups users by their first-activity cohort week and tracks
   * how many return in subsequent weeks.
   */
  async getRetentionMatrix(tenantId: string, cohortWeeks = 8): Promise<RetentionRow[]> {
    const client = getClickHouseClient();
    const resultSet = await client.query({
      query: `
        WITH cohorts AS (
          SELECT
            user_id,
            toStartOfWeek(min(hour)) AS cohort_week
          FROM analytics.dws_user_hourly
          WHERE tenant_id = {tenant_id:String}
          GROUP BY user_id
        ),
        activity AS (
          SELECT
            user_id,
            toStartOfWeek(hour) AS active_week
          FROM analytics.dws_user_hourly
          WHERE tenant_id = {tenant_id:String}
          GROUP BY user_id, active_week
        )
        SELECT
          toString(c.cohort_week) AS cohort_week,
          toUInt32(dateDiff('week', c.cohort_week, a.active_week)) AS week_offset,
          toUInt32(uniqExact(a.user_id)) AS users
        FROM cohorts c
        INNER JOIN activity a ON c.user_id = a.user_id
        WHERE c.cohort_week >= toStartOfWeek(now() - INTERVAL {cohort_weeks:UInt32} WEEK)
        GROUP BY c.cohort_week, week_offset
        ORDER BY c.cohort_week, week_offset
      `,
      query_params: { tenant_id: tenantId, cohort_weeks: cohortWeeks },
      format: 'JSONEachRow',
    });
    return resultSet.json<RetentionRow>();
  }

  /**
   * Query conversion funnel from ods_events.
   * Counts distinct users at each funnel step: visit -> signup -> first_chat -> subscription.
   */
  async getConversionFunnel(tenantId: string, days = 30): Promise<FunnelStep[]> {
    const client = getClickHouseClient();
    const resultSet = await client.query({
      query: `
        SELECT step, toUInt32(cnt) AS users
        FROM (
          SELECT 'visit' AS step, 1 AS sort_order,
            uniqExact(user_id) AS cnt
          FROM analytics.ods_events
          WHERE tenant_id = {tenant_id:String}
            AND event_type = 'page.view'
            AND timestamp >= now() - INTERVAL {days:UInt32} DAY
          UNION ALL
          SELECT 'signup' AS step, 2 AS sort_order,
            uniqExact(user_id) AS cnt
          FROM analytics.ods_events
          WHERE tenant_id = {tenant_id:String}
            AND event_type = 'user.registered'
            AND timestamp >= now() - INTERVAL {days:UInt32} DAY
          UNION ALL
          SELECT 'first_chat' AS step, 3 AS sort_order,
            uniqExact(user_id) AS cnt
          FROM analytics.ods_events
          WHERE tenant_id = {tenant_id:String}
            AND event_type = 'chat.message.created'
            AND timestamp >= now() - INTERVAL {days:UInt32} DAY
          UNION ALL
          SELECT 'subscription' AS step, 4 AS sort_order,
            uniqExact(user_id) AS cnt
          FROM analytics.ods_events
          WHERE tenant_id = {tenant_id:String}
            AND event_type = 'user.subscription.changed'
            AND timestamp >= now() - INTERVAL {days:UInt32} DAY
        )
        ORDER BY sort_order
      `,
      query_params: { tenant_id: tenantId, days },
      format: 'JSONEachRow',
    });
    return resultSet.json<FunnelStep>();
  }

  /**
   * Query top characters by total messages from dws_character_daily.
   */
  async getTopCharacters(tenantId: string, limit = 20): Promise<TopCharacter[]> {
    const client = getClickHouseClient();
    const resultSet = await client.query({
      query: `
        SELECT
          character_id,
          sum(messages) AS total_messages,
          sum(chat_starts) AS total_chat_starts,
          avgMerge(avg_rating) AS avg_rating
        FROM analytics.dws_character_daily
        WHERE tenant_id = {tenant_id:String}
        GROUP BY character_id
        ORDER BY total_messages DESC
        LIMIT {limit:UInt32}
      `,
      query_params: { tenant_id: tenantId, limit },
      format: 'JSONEachRow',
    });
    return resultSet.json<TopCharacter>();
  }

  /**
   * Read realtime metrics from Redis keys written by Flink.
   * Keys follow the pattern rt:{tenantId}:{metric}.
   */
  async getRealtimeMetrics(tenantId: string): Promise<RealtimeMetrics> {
    const redis = await getRedisClient();
    const [activeUsers, eventsPerMin, messagesPerMin] = await Promise.all([
      redis.get(`rt:${tenantId}:active_users`),
      redis.get(`rt:${tenantId}:events_per_min`),
      redis.get(`rt:${tenantId}:messages_per_min`),
    ]);
    return {
      activeUsers: parseInt(activeUsers || '0', 10),
      eventsPerMin: parseInt(eventsPerMin || '0', 10),
      messagesPerMin: parseInt(messagesPerMin || '0', 10),
    };
  }

  /**
   * Segment users by activity level from dws_user_hourly.
   * Segments: power (50+ events/week), active (10-49), casual (1-9), dormant (0 in last 2 weeks).
   */
  async getUserSegments(tenantId: string): Promise<UserSegment[]> {
    const client = getClickHouseClient();
    const resultSet = await client.query({
      query: `
        SELECT segment, toUInt32(count()) AS user_count
        FROM (
          SELECT
            user_id,
            CASE
              WHEN weekly_events >= 50 THEN 'power'
              WHEN weekly_events >= 10 THEN 'active'
              WHEN weekly_events >= 1  THEN 'casual'
              ELSE 'dormant'
            END AS segment
          FROM (
            SELECT
              user_id,
              sum(event_count) AS weekly_events
            FROM analytics.dws_user_hourly
            WHERE tenant_id = {tenant_id:String}
              AND hour >= toStartOfWeek(now()) - INTERVAL 2 WEEK
            GROUP BY user_id
          )
        )
        GROUP BY segment
        ORDER BY
          CASE segment
            WHEN 'power' THEN 1
            WHEN 'active' THEN 2
            WHEN 'casual' THEN 3
            ELSE 4
          END
      `,
      query_params: { tenant_id: tenantId },
      format: 'JSONEachRow',
    });
    return resultSet.json<UserSegment>();
  }
}

export const analyticsQueryService = new AnalyticsQueryService();
