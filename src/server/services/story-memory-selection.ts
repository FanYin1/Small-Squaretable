import type { StoryMemoryOrigin } from './story-knowledge.service';

export function selectStoryMemoryContext<Memory extends { id: string; content: string; type: string }>(
  candidates: Memory[], origins: Map<string, StoryMemoryOrigin>, limit = 5,
): Memory[] {
  const valid = [...new Map(candidates.filter(memory => origins.has(memory.id)).map(memory => [memory.id, memory])).values()];
  const preferences = valid.filter(memory => origins.get(memory.id)!.type === 'preference')
    .sort((left, right) => origins.get(right.id)!.lastVersion - origins.get(left.id)!.lastVersion || left.id.localeCompare(right.id))
    .slice(0, Math.min(2, limit));
  const selected = [...preferences, ...valid.filter(memory => !preferences.some(preference => preference.id === memory.id))].slice(0, limit);
  return selected.map(memory => {
    const origin = origins.get(memory.id)!;
    return { ...memory, type: origin.type,
      content: `[来源事件版本 ${origin.firstVersion}–${origin.lastVersion}；原文 ${origin.sourceMessageIds.join(',')}] ${origin.content}` };
  });
}

export function storyMemoryEvictionIds(memories: Array<{ id: string; type: string }>, limit: number): string[] {
  const retainedPreferences = new Set(memories.filter(memory => memory.type === 'preference').slice(-Math.min(2, limit)).map(memory => memory.id));
  return memories.filter(memory => !retainedPreferences.has(memory.id))
    .slice(0, Math.max(0, memories.length - limit)).map(memory => memory.id);
}
