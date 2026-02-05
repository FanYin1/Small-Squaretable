/**
 * Unified test setup for both client and server tests
 */

import { beforeEach, vi } from 'vitest';

// Check if we're in a browser-like environment (jsdom)
const isBrowserEnv = typeof window !== 'undefined' && typeof document !== 'undefined';

if (isBrowserEnv) {
  // Client-side setup (jsdom environment)

  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  global.localStorage = localStorageMock as Storage;

  // Mock scrollIntoView for jsdom
  if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = () => {};
  }

  // Mock matchMedia for jsdom
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Clear localStorage before each test
  beforeEach(() => {
    localStorage.clear();
  });
} else {
  // Server-side setup (node environment)

  // Ensure environment variables are set for tests
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-unit-testing-minimum-32-chars';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
}

// Clear all mocks before each test (works in both environments)
beforeEach(() => {
  vi.clearAllMocks();
});
