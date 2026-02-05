/**
 * Structured Logger Service
 *
 * Provides JSON-formatted logging with support for multiple log levels,
 * request tracking, user context, and tenant isolation
 */

import { config } from '@/core/config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  action?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  environment: string;
  [key: string]: unknown;
}

/**
 * Get log level priority for comparison
 */
function getLevelPriority(level: LogLevel): number {
  const priorities: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };
  return priorities[level];
}

/**
 * Get configured minimum log level from environment
 */
function getMinLogLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || 'info';
  if (['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    return envLevel;
  }
  return 'info';
}

/**
 * Check if a log should be emitted based on configured level
 */
function shouldLog(level: LogLevel): boolean {
  const minLevel = getMinLogLevel();
  return getLevelPriority(level) >= getLevelPriority(minLevel);
}

/**
 * Format log entry as JSON
 */
function formatLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  additionalData?: Record<string, unknown>
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    ...context,
    ...additionalData,
  };

  // Add pid for process identification
  entry.pid = process.pid;

  // Add hostname if available
  if (process.env.HOSTNAME) {
    entry.hostname = process.env.HOSTNAME;
  }

  return entry;
}

/**
 * Output log entry to console
 */
function outputLog(entry: LogEntry): void {
  const isDev = config.nodeEnv === 'development';

  if (isDev) {
    // Pretty print in development
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    const color = colors[entry.level];
    const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';

    console.log(`${color}[${entry.level.toUpperCase()}]${reset} ${entry.timestamp} - ${entry.message}${context}`);
  } else {
    // JSON output in production
    console.log(JSON.stringify(entry));
  }
}

/**
 * Create a logger with optional context
 */
export function createLogger(context?: LogContext) {
  return {
    /**
     * Log debug message
     */
    debug: (message: string, additionalData?: Record<string, unknown>) => {
      if (shouldLog('debug')) {
        const entry = formatLogEntry('debug', message, context, additionalData);
        outputLog(entry);
      }
    },

    /**
     * Log info message
     */
    info: (message: string, additionalData?: Record<string, unknown>) => {
      if (shouldLog('info')) {
        const entry = formatLogEntry('info', message, context, additionalData);
        outputLog(entry);
      }
    },

    /**
     * Log warning message
     */
    warn: (message: string, additionalData?: Record<string, unknown>) => {
      if (shouldLog('warn')) {
        const entry = formatLogEntry('warn', message, context, additionalData);
        outputLog(entry);
      }
    },

    /**
     * Log error message
     */
    error: (message: string, error?: Error | unknown, additionalData?: Record<string, unknown>) => {
      if (shouldLog('error')) {
        let errorData = additionalData;

        if (error) {
          errorData = {
            ...errorData,
            error: {
              name: error instanceof Error ? error.name : 'Unknown',
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          };
        }

        const entry = formatLogEntry('error', message, context, errorData);
        outputLog(entry);
      }
    },

    /**
     * Create a child logger with additional context
     */
    child: (additionalContext: LogContext) => {
      return createLogger({
        ...context,
        ...additionalContext,
      });
    },
  };
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Log HTTP request
 */
export function logRequest(context: LogContext & { method: string; path: string; status: number; duration?: number }) {
  const { method, path, status, duration, ...rest } = context;

  const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  const message = `${method} ${path} ${status}`;

  logger[logLevel](message, {
    ...rest,
    http: {
      method,
      path,
      status,
      duration,
    },
  });
}

/**
 * Log database query
 */
export function logDatabaseQuery(context: LogContext & { query?: string; duration?: number }) {
  logger.debug('Database query', {
    database: {
      query: context.query,
      duration: context.duration,
    },
    ...context,
  });
}

/**
 * Log cache operation
 */
export function logCacheOperation(context: LogContext & { operation: 'get' | 'set' | 'del' | 'clear'; key?: string; duration?: number }) {
  logger.debug('Cache operation', {
    cache: {
      operation: context.operation,
      key: context.key,
      duration: context.duration,
    },
    ...context,
  });
}

/**
 * Log security event
 */
export function logSecurityEvent(context: LogContext & { event: string; details?: Record<string, unknown> }) {
  logger.warn(`Security event: ${context.event}`, {
    security: {
      event: context.event,
      details: context.details,
    },
    ...context,
  });
}

/**
 * Get log level configuration info
 */
export function getLogConfig() {
  return {
    minLevel: getMinLogLevel(),
    environment: config.nodeEnv,
    format: config.nodeEnv === 'development' ? 'pretty' : 'json',
  };
}
