/**
 * Sentry Client Configuration
 *
 * Configures Sentry for frontend error tracking with Vue integration
 */

import * as Sentry from '@sentry/vue';
import type { Router } from 'vue-router';
import { useUserStore } from '@client/stores/user';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate?: number;
  replaysSessionSampleRate?: number;
  replaysOnErrorSampleRate?: number;
}

/**
 * Initialize Sentry for frontend error tracking
 */
export function initSentry(app: any, router: Router | null = null) {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

  if (!sentryDsn) {
    console.warn('Sentry DSN not configured, skipping Sentry initialization');
    return;
  }

  const isProduction = import.meta.env.PROD;

  const sentryConfig: SentryConfig = {
    dsn: sentryDsn,
    environment: isProduction ? 'production' : 'development',
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    replaysSessionSampleRate: isProduction ? 0.05 : 1.0,
    replaysOnErrorSampleRate: 1.0,
  };

  const integrations: Sentry.BrowserOptions['integrations'] = [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ];

  if (router) {
    integrations.push(Sentry.browserTracingIntegration({ router }));
  }

  Sentry.init({
    ...sentryConfig,
    integrations,
    beforeSend(event, hint) {
      // Filter out errors from browser extensions
      if (event.exception && event.exception.values) {
        for (const exception of event.exception.values) {
          if (exception.stacktrace && exception.stacktrace.frames) {
            for (const frame of exception.stacktrace.frames) {
              if (frame.filename && frame.filename.includes('extension')) {
                return null;
              }
            }
          }
        }
      }

      // Add additional context
      const userStore = useUserStore();
      if (userStore.user) {
        event.user = {
          id: userStore.user.id,
          email: userStore.user.email,
          tenantId: userStore.user.tenantId,
          role: userStore.user.role,
        };
      }

      return event;
    },
    // Set default tags
    initialScope: {
      tags: {
        platform: 'web',
        framework: 'vue',
      },
    },
  });

  // Set up user context change watcher
  if (isProduction) {
    watchUserContext();
  }

  console.log('Sentry initialized for environment:', sentryConfig.environment);
}

/**
 * Watch for user authentication state changes
 */
function watchUserContext() {
  let lastUserId: string | null = null;

  // Check every 5 seconds for user changes
  setInterval(() => {
    const userStore = useUserStore();
    const currentUserId = userStore.user?.id || null;

    if (currentUserId !== lastUserId) {
      if (currentUserId) {
        Sentry.setUser({
          id: userStore.user.id,
          email: userStore.user.email,
          tenantId: userStore.user.tenantId,
          role: userStore.user.role,
        });
      } else {
        Sentry.setUser(null);
      }
      lastUserId = currentUserId;
    }
  }, 5000);
}

/**
 * Capture an exception
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
 * Add a breadcrumb for debugging
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
 * Set user context
 */
export function setUser(user: {
  id: string;
  email?: string;
  tenantId?: string;
  role?: string;
}) {
  Sentry.setUser(user);
}

/**
 * Clear user context
 */
export function clearUser() {
  Sentry.setUser(null);
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
 * Capture user feedback
 */
export function captureFeedback(message: string, email?: string, name?: string) {
  Sentry.captureFeedback({
    message,
    email,
    name,
  });
}

/**
 * Set global context data
 */
export function setContext(key: string, context: Record<string, unknown>) {
  Sentry.setContext(key, context);
}
