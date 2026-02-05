/**
 * Security Headers Middleware
 *
 * Provides comprehensive security headers to protect against common web vulnerabilities:
 * - Content Security Policy (CSP)
 * - X-Content-Type-Options
 * - X-Frame-Options
 * - X-XSS-Protection
 * - Referrer-Policy
 * - Permissions-Policy
 * - Strict-Transport-Security (HSTS)
 */

import { createMiddleware } from 'hono/factory';
import { config } from '../../core/config';

interface SecurityHeadersOptions {
  nonce?: string;
  reportUri?: string;
  reportOnly?: boolean;
  additionalDirectives?: Record<string, string>;
}

/**
 * Default CSP directives
 *
 * Note: Vue.js applications often require 'unsafe-eval' for development
 * and sometimes 'unsafe-inline' for certain features.
 */
const DEFAULT_CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", 'ws:', 'wss:'],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'child-src': ["'self'", 'blob:'],
  'upgrade-insecure-requests': [],
};

/**
 * Build CSP header value
 */
function buildCspHeader(options: SecurityHeadersOptions): string {
  const { nonce, reportUri, reportOnly = false, additionalDirectives = {} } = options;

  const directives: Record<string, string[]> = {
    ...DEFAULT_CSP_DIRECTIVES,
    ...additionalDirectives,
  };

  // Add nonce to script-src if provided
  if (nonce) {
    if (!directives['script-src']) {
      directives['script-src'] = [];
    }
    directives['script-src'].push(`'nonce-${nonce}'`);
  }

  // Add report-uri if provided
  if (reportUri) {
    directives['report-uri'] = [reportUri];
  }

  // Build the header string
  const headerParts: string[] = [];
  for (const [directive, values] of Object.entries(directives)) {
    headerParts.push(`${directive} ${values.join(' ')}`);
  }

  return headerParts.join('; ');
}

/**
 * Build Permissions-Policy (formerly Feature-Policy) header
 */
function buildPermissionsPolicyHeader(): string {
  const policies = [
    'geolocation=()',
    'midi=()',
    'notifications=()',
    'push=()',
    'sync-xhr=()',
    'microphone=()',
    'camera=()',
    'magnetometer=()',
    'gyroscope=()',
    'speaker=()',
    'vibrate=()',
    'fullscreen=(self)',
    'payment=()',
  ];
  return policies.join(', ');
}

/**
 * Security Headers Middleware
 *
 * Applies security headers to all responses
 */
export function securityHeaders(options: SecurityHeadersOptions = {}) {
  return createMiddleware(async (c, next) => {
    await next();

    // Apply Content Security Policy
    const cspHeader = buildCspHeader(options);
    c.header('Content-Security-Policy', cspHeader);

    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');

    // Enable XSS filter (legacy, but still useful for older browsers)
    c.header('X-XSS-Protection', '1; mode=block');

    // Control referrer information leakage
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy
    c.header('Permissions-Policy', buildPermissionsPolicyHeader());

    // HSTS only in production with HTTPS
    if (config.nodeEnv === 'production' && c.req.url.startsWith('https://')) {
      c.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }

    // Cross-Origin Opener Policy for additional isolation
    c.header('Cross-Origin-Opener-Policy', 'same-origin');

    // Cross-Origin Resource Policy
    c.header('Cross-Origin-Resource-Policy', 'same-origin');

    // Cross-Origin Embedder Policy (if using SharedArrayBuffer)
    if (config.nodeEnv === 'production') {
      c.header('Cross-Origin-Embedder-Policy', 'require-corp');
    }

    // Remove X-Powered-By header (if it exists)
    c.header('X-Powered-By', '');
  });
}

/**
 * Relaxed security headers for development
 *
 * Uses a more permissive CSP to facilitate development
 */
export function developmentSecurityHeaders() {
  return createMiddleware(async (c, next) => {
    await next();

    // Relaxed CSP for development
    c.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss: http://localhost:*",
        "frame-ancestors 'self'",
      ].join('; ')
    );

    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
  });
}
