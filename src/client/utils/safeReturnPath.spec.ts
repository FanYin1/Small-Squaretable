import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './safeReturnPath';

describe('safeReturnPath', () => {
  it.each(['/chat/abc-1', '/market?q=mystery', '/characters/abc?storyEntry=1', '/profile'])('preserves allowed route %s', value => {
    expect(safeReturnPath(value)).toBe(value);
  });
  it.each([undefined, ['/', '/profile'], '//evil.test', 'https://evil.test', '/\\evil.test', '/%2fevil.test', '/%5cevil.test', '/%00', '/%', '/auth/login', '/admin/users', '/market/../auth/login'])('rejects unsafe or unsupported route %s', value => {
    expect(safeReturnPath(value)).toBe('/chat');
  });
});
