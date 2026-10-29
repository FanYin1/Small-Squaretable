import { describe, expect, it } from 'vitest';
import { buildMemoryParts } from './prompt-assembly';
import { selectStoryMemoryContext, storyMemoryEvictionIds } from './story-memory-selection';

describe('story memory continuity context', () => {
  it('keeps the legacy prompt unchanged', () => {
    expect(buildMemoryParts([{ type: 'preference', content: '简短回答' }])).toEqual(['\n## 关于用户的记忆', '【偏好】简短回答']);
  });

  it('labels source-versioned story agreements and style as historical derived context', () => {
    const text = buildMemoryParts([
      { type: 'event', content: '[来源事件版本 1–1；原文 2] 原约定明晚会面，未赴约。' },
      { type: 'event', content: '[来源事件版本 6–6；原文 12] 双方后来改约后天。' },
      { type: 'preference', content: '[来源事件版本 2–2；原文 3] 玩家希望短句。' },
    ], true).join('\n');
    expect(text).toContain('不是现实用户资料或当前状态');
    expect(text).toContain('更新原文为准');
    expect(text).toContain('表达偏好只作用于本次体验');
    expect(text).toContain('原约定明晚会面，未赴约。');
    expect(text).toContain('双方后来改约后天。');
    expect(text).toContain('原文 3');
  });

  it('does not invent a memory block when no provenance survived', () => {
    expect(buildMemoryParts([], true)).toEqual([]);
  });

  it('reserves bounded preference slots despite unrelated vector ranking and removes invalid candidates', () => {
    const candidates = Array.from({ length: 8 }, (_, index) => ({ id: String(index), type: index >= 5 ? 'preference' : 'event', content: 'stale read' }));
    const origins = new Map(candidates.slice(1).map((memory, index) => [memory.id, {
      type: memory.type, content: `verified ${memory.id}`, firstVersion: index + 1, lastVersion: index + 1, sourceMessageIds: [index + 1],
    }]));
    const selected = selectStoryMemoryContext(candidates, origins);
    expect(selected.map(memory => memory.id)).toEqual(['7', '6', '1', '2', '3']);
    expect(selected.every(memory => memory.content.includes('verified') && !memory.content.includes('stale read'))).toBe(true);
  });

  it('retains at most two recent preferences while keeping the configured capacity', () => {
    const memories = [
      { id: 'old-style', type: 'preference' }, { id: 'old-event', type: 'event' },
      { id: 'new-style', type: 'preference' }, { id: 'latest-style', type: 'preference' }, { id: 'new-event', type: 'event' },
    ];
    expect(storyMemoryEvictionIds(memories, 3)).toEqual(['old-style', 'old-event']);
    expect(storyMemoryEvictionIds(memories, 1)).toEqual(['old-style', 'old-event', 'new-style', 'new-event']);
    expect(storyMemoryEvictionIds(memories, 10)).toEqual([]);
  });
});
