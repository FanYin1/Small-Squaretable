import { describe, expect, it } from 'vitest';
import { messageWindow } from './message-window';

describe('variable-height chat viewport', () => {
  it('keeps the visible tail after tall overscan messages instead of rendering a blank spacer', () => {
    const heights = [100, 1800, 100, 1700, 100, 1600, 100, 100, 100, 1200, 100];
    const range = messageWindow(heights, 5500, 800);
    expect(range.start).toBeLessThanOrEqual(7);
    expect(range.end).toBeGreaterThan(9);
    expect(range.top).toBeLessThanOrEqual(5500);
    expect(range.total - range.bottom).toBeGreaterThanOrEqual(6300);
  });
  it('counts the scrolled portion inside a single long reply before finding the viewport bottom', () => {
    expect(messageWindow([10000, 100, 100, 1000], 9900, 700, 0)).toMatchObject({ start: 0, end: 4, bottom: 0 });
  });
  it('covers every viewport while scrolling both ways through alternating long and short messages', () => {
    const heights = Array.from({ length: 120 }, (_, i) => i % 2 ? 1500 + i * 3 : 70);
    const total = heights.reduce((sum, h) => sum + h, 0);
    for (const viewport of [390, 800, 1500]) {
      for (let top = total; top >= 0; top -= 93) {
        const range = messageWindow(heights, top, viewport);
        expect(range.top).toBeLessThanOrEqual(top);
        expect(total - range.bottom).toBeGreaterThanOrEqual(Math.min(total, top + viewport));
        expect(range.top + heights.slice(range.start, range.end).reduce((sum, h) => sum + h, 0) + range.bottom).toBe(total);
      }
    }
  });
  it('handles empty lists, leading content offsets, resized rows and scroll beyond content', () => {
    expect(messageWindow([], 100, 800)).toEqual({ start: 0, end: 0, top: 0, bottom: 0, total: 0 });
    expect(messageWindow([900, 100, 1000], -40, 500, 0)).toMatchObject({ start: 0, end: 1 });
    expect(messageWindow([100, 100, 1000], 180, 500, 0)).toMatchObject({ start: 1, end: 3 });
    expect(messageWindow([100, 100, 1000], 9000, 500, 0)).toMatchObject({ start: 2, end: 3 });
  });
});
