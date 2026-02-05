/**
 * Sentry Error Tracking Service
 *
 * Initializes and configures Sentry for backend error tracking
 */

import * as Sentry from '@sentry/node';
import { config } from '@/core/config';

interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate?: number;
  profilesSampleRate?: number;
}

/**
 * Initialize Sentry for error tracking
 */
export function initializeSentry() {
  const sentryDsn = process.env.SENTRY_DSN;

  if (!sentryDsn) {
    console.warn('Sentry DSN not configured, skipping Sentry initialization');
    return;
  }

  const sentryConfig: SentryConfig = {
    dsn: sentryDsn,
    environment: config.nodeEnv,
    tracesSampleRate: config.nodeEnv === 'production' ? 0.1 : 1.0,
    profilesSampleRate: config.nodeEnv === 'production' ? 0.1 : 1.0,
  };

  Sentry.init(sentryConfig);

  console.log('Sentry initialized for environment:', config.nodeEnv);
}

/**
 * Capture an exception with additional context
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for the current request
 */
export function setUserContext(user: {
  id: string;
  email?: string;
  tenantId?: string;
  role?: string;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  });
}

/**
 * Clear the current user context
 */
export function clearUserContext() {
  Sentry.setUser(null);
}

/**
 * Add a breadcrumb for debugging context
 */
export function addBreadcrumb(
  message: string,
  category?: string,
  level?: Sentry.SeverityLevel,
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
  });
}

/**
 * Start a performance transaction
 */
export function startTransaction(name: string, op: string) {
  return Sentry.startSpan({ name, op }, () => {
    // Transaction will be automatically ended
  });
}

/**
 * Close Sentry and flush pending events
 */
export async function closeSentry() {
  await Sentry.close(2000); // Wait up to 2 seconds for events to be sent
}
