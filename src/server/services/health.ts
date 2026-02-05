/**
 * Health check service
 * Provides comprehensive health checks for the application
 */

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { createClient } from 'redis';
import { config } from '@/core/config';

// Track server startup time
const serverStartTime = Date.now();
const PACKAGE_VERSION = '0.1.0';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  hostname: string;
  checks?: {
    database?: {
      status: 'ok' | 'error';
      latency?: number;
      error?: string;
      details?: {
        pool?: {
          min: number;
          max: number;
          active?: number;
          idle?: number;
        };
      };
    };
    redis?: {
      status: 'ok' | 'error';
      latency?: number;
      error?: string;
      details?: {
        connected?: boolean;
        memory_usage?: string;
      };
    };
  };
  system?: {
    node_version: string;
    platform: string;
    arch: string;
    memory?: {
      rss: string;
      heap_total: string;
      heap_used: string;
      heap_usage_percent: number;
    };
  };
}

/**
 * Get system metrics
 */
function getSystemMetrics() {
  const memoryUsage = process.memoryUsage();
  const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  return {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    memory: {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heap_total: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heap_used: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heap_usage_percent: Math.round(heapUsagePercent * 100) / 100,
    },
  };
}

/**
 * Basic health check - always returns ok if server is running
 */
export async function basicHealthCheck(): Promise<HealthStatus> {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - serverStartTime,
    version: PACKAGE_VERSION,
    environment: config.nodeEnv,
    hostname: process.env.HOSTNAME || 'localhost',
    system: getSystemMetrics(),
  };
}

/**
 * Liveness check - checks if the application is alive
 * Used by Kubernetes to determine if pod should be restarted
 */
export async function livenessCheck(): Promise<HealthStatus> {
  const systemMetrics = getSystemMetrics();
  const isHealthy = systemMetrics.memory?.heap_usage_percent !== undefined
    ? systemMetrics.memory.heap_usage_percent < 90
    : true;

  return {
    status: isHealthy ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - serverStartTime,
    version: PACKAGE_VERSION,
    environment: config.nodeEnv,
    hostname: process.env.HOSTNAME || 'localhost',
    system: systemMetrics,
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
      details: {
        pool: {
          min: config.databasePoolMin,
          max: config.databasePoolMax,
        },
      },
    };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        pool: {
          min: config.databasePoolMin,
          max: config.databasePoolMax,
        },
      },
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
    const redisLatency = Date.now() - redisStart;
    await redisClient.ping();
    const memoryInfo = await redisClient.info('memory').then((info: string) => {
      const match = info.match(/used_memory_human:([^\r\n]+)/);
      return match ? match[1] : undefined;
    });
    await redisClient.quit();

    checks.redis = {
      status: 'ok',
      latency: redisLatency,
      details: {
        connected: true,
        memory_usage: memoryInfo,
      },
    };
  } catch (error) {
    checks.redis = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        connected: false,
      },
    };
    // Redis failure is degraded, not error (can still serve some traffic)
    if (overallStatus === 'ok') {
      overallStatus = 'degraded';
    }
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - serverStartTime,
    version: PACKAGE_VERSION,
    environment: config.nodeEnv,
    hostname: process.env.HOSTNAME || 'localhost',
    checks,
    system: getSystemMetrics(),
  };
}
