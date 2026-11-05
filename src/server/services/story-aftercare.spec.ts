import { expect, it, vi } from 'vitest';
import { StoryAftercare } from './story-aftercare';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
it('returns immediately, serializes each story and lets other stories proceed', async () => {
  const queue = new StoryAftercare(2, 4); const events: string[] = [];
  let finish!: () => void;
  const failure = vi.fn();
  expect(queue.enqueue('a', async () => { events.push('a1'); await new Promise<void>(resolve => { finish = resolve; }); }, failure)).toBe(true);
  queue.enqueue('a', async () => { events.push('a2'); }, failure);
  queue.enqueue('b', async () => { events.push('b'); }, failure);
  await tick(); expect(events).toEqual(['a1', 'b']);
  finish(); await tick(); expect(events).toEqual(['a1', 'b', 'a2']); expect(failure).not.toHaveBeenCalled();
});
it('bounds hung work and does not replace previously accepted jobs', async () => {
  const queue = new StoryAftercare(1, 2); const extra = vi.fn();
  let finish!: () => void;
  queue.enqueue('a', () => new Promise<void>(resolve => { finish = resolve; }), vi.fn());
  queue.enqueue('a', async () => {}, vi.fn());
  expect(queue.enqueue('b', extra, vi.fn())).toBe(false); await tick(); expect(extra).not.toHaveBeenCalled();
  finish(); await tick(); expect(queue.enqueue('b', extra, vi.fn())).toBe(true); await tick(); expect(extra).toHaveBeenCalledOnce();
});
it('continues after task and error reporter failures', async () => {
  const queue = new StoryAftercare(1, 2), next = vi.fn();
  queue.enqueue('a', async () => { throw new Error('fixture'); }, () => { throw new Error('logger'); });
  queue.enqueue('a', next, vi.fn()); await tick(); expect(next).toHaveBeenCalledOnce();
});
