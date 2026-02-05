/**
 * Input Validation and Sanitization Middleware
 *
 * Provides utilities for sanitizing user input to prevent XSS and injection attacks.
 */

/**
 * HTML entity encoding for XSS prevention
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize a string by trimming and limiting length
 */
export function sanitizeString(str: string, maxLength: number = 1000): string {
  const trimmed = str.trim();
  return trimmed.length > maxLength ? trimmed.substring(0, maxLength) : trimmed;
}

/**
 * Sanitize an array of strings
 */
export function sanitizeStringArray(arr: string[], maxLength: number = 100): string[] {
  return arr.map((s) => sanitizeString(s, maxLength)).filter((s) => s.length > 0);
}

/**
 * Sanitize a metadata object (record of strings)
 */
export function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    // Only allow string values, convert others to strings
    const sanitizedKey = sanitizeString(key, 100);
    if (sanitizedKey.length === 0) continue;

    let sanitizedValue: string;
    if (typeof value === 'string') {
      sanitizedValue = sanitizeString(value, 1000);
    } else if (value === null || value === undefined) {
      sanitizedValue = '';
    } else {
      // Convert non-string values to strings (numbers, booleans, etc.)
      sanitizedValue = sanitizeString(String(value), 1000);
    }

    if (sanitizedValue.length > 0) {
      sanitized[sanitizedKey] = sanitizedValue;
    }
  }
  return sanitized;
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Only allow http, https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid URL protocol');
    }
    return parsed.href;
  } catch {
    throw new Error('Invalid URL format');
  }
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    throw new Error('Invalid email format');
  }
  return trimmed;
}

/**
 * Sanitize UUID
 */
export function sanitizeUuid(uuid: string): string {
  const trimmed = uuid.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(trimmed)) {
    throw new Error('Invalid UUID format');
  }
  return trimmed;
}

/**
 * Sanitize search query to prevent injection attacks
 */
export function sanitizeSearchQuery(query: string): string {
  // Remove potential SQL-like patterns
  const sanitized = query
    .replace(/['";\\]/g, '') // Remove quotes and backslashes
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
  return sanitized;
}

/**
 * Validate that a value is a safe JSON object
 */
export function validateSafeJson(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => validateSafeJson(item));
  }
  if (typeof value === 'object') {
    return Object.values(value).every((item) => validateSafeJson(item));
  }
  return false;
}

/**
 * Sanitize card data (SillyTavern format)
 */
export function sanitizeCardData(cardData: Record<string, unknown>): Record<string, unknown> {
  if (!validateSafeJson(cardData)) {
    throw new Error('Invalid card data format');
  }

  // Recursively sanitize all string values
  function deepSanitize(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return escapeHtml(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(deepSanitize);
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Limit key length
        const sanitizedKey = key.substring(0, 100);
        sanitized[sanitizedKey] = deepSanitize(value);
      }
      return sanitized;
    }
    return obj;
  }

  return deepSanitize(cardData) as Record<string, unknown>;
}
