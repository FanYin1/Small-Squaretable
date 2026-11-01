import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createRequestId } from './request-id';

afterEach(() => vi.unstubAllGlobals());

describe('request IDs across browser security contexts', () => {
  it('uses the native UUID implementation when available', () => {
    const randomUUID = vi.fn(() => '5f8b8a77-a79e-4a45-b064-d7a70b850bf3');
    vi.stubGlobal('crypto', { randomUUID });
    expect(createRequestId()).toBe('5f8b8a77-a79e-4a45-b064-d7a70b850bf3');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates distinct valid v4 UUIDs without the secure-context-only API', () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const ids = Array.from({ length: 100 }, createRequestId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not silently fall back to insecure randomness', () => {
    vi.stubGlobal('crypto', {});
    expect(() => createRequestId()).toThrow();
  });
});
