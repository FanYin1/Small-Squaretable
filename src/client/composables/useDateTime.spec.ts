import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDateTime } from './useDateTime';

describe('useDateTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatRelativeTime', () => {
    it('returns "just now" for less than 60 seconds ago', () => {
      const { formatRelativeTime } = useDateTime();
      const thirtySecondsAgo = new Date('2026-02-21T11:59:30.000Z');
      expect(formatRelativeTime(thirtySecondsAgo)).toBe('just now');
    });

    it('returns "Xm ago" for minutes', () => {
      const { formatRelativeTime } = useDateTime();
      const fiveMinutesAgo = new Date('2026-02-21T11:55:00.000Z');
      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago');
    });

    it('returns "Xh ago" for hours', () => {
      const { formatRelativeTime } = useDateTime();
      const threeHoursAgo = new Date('2026-02-21T09:00:00.000Z');
      expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
    });

    it('returns "Xd ago" for days', () => {
      const { formatRelativeTime } = useDateTime();
      const fiveDaysAgo = new Date('2026-02-16T12:00:00.000Z');
      expect(formatRelativeTime(fiveDaysAgo)).toBe('5d ago');
    });

    it('returns locale date string for more than 30 days ago', () => {
      const { formatRelativeTime } = useDateTime();
      const sixtyDaysAgo = new Date('2025-12-23T12:00:00.000Z');
      const result = formatRelativeTime(sixtyDaysAgo);
      // Should be a locale date string, not a relative time
      expect(result).not.toContain('ago');
      expect(result).not.toBe('just now');
    });
  });

  describe('formatTime', () => {
    it('returns a time string', () => {
      const { formatTime } = useDateTime();
      const result = formatTime('2026-02-21T14:30:00.000Z');
      // toLocaleTimeString returns something like "2:30:00 PM" or "14:30:00"
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  it('accepts Date objects as well as strings', () => {
    const { formatRelativeTime, formatTime } = useDateTime();
    const dateObj = new Date('2026-02-21T11:55:00.000Z');
    expect(formatRelativeTime(dateObj)).toBe('5m ago');
    expect(typeof formatTime(dateObj)).toBe('string');
  });
});
