/**
 * Health check service
 * Provides comprehensive health checks for the application
 */

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { createClient } from 'redis';
import { config } from '@/core/config';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  checks?: {
    database?: {
      status: 'ok' | 'error';
      latency?: number;
      error?: string;
    };
    redis?: {
      status: 'ok' | 'error';
      latency?: number;
      error?: string;
    };
  };
}

/**
 * Basic health check - always returns ok if server is running
 */
export async function basicHealthCheck(): Promise<HealthStatus> {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  };
}

/**
 * Liveness check - checks if the application is alive
 * Used by Kubernetes to determine if pod should be restarted
 */
export async function livenessCheck(): Promise<HealthStatus> {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  };
}

/**
 * Readiness check - checks if application is ready to serve traffic
 * Verifies database and Redis connections
 */
export async function readinessCheck(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {};
  let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';

  // Check database connection
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatency = Date.now() - dbStart;

    checks.database = {
      status: 'ok',
      latency: dbLatency,
    };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    overallStatus = 'error';
  }

  // Check Redis connection
  try {
    const redisStart = Date.now();
    const redisClient = createClient({
      url: config.redisUrl,
      password: config.redisPassword,
    });

    await redisClient.connect();
    await redisClient.ping();
    const redisLatency = Date.now() - redisStart;
    await redisClient.quit();

    checks.redis = {
      status: 'ok',
      latency: redisLatency,
    };
  } catch (error) {
    checks.redis = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    // Redis failure is degraded, not error (can still serve some traffic)
    if (overallStatus === 'ok') {
      overallStatus = 'degraded';
    }
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    checks,
  };
}
