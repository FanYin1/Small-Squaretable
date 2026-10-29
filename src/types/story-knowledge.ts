import { z } from 'zod';

export const storyAudienceSchema = z.array(z.string().uuid()).min(1).max(16)
  .refine(ids => new Set(ids).size === ids.length, 'Duplicate audience member');

export type StoryAudience = z.infer<typeof storyAudienceSchema>;

export function storyKnowledgeVisible(extra: unknown, characterId: string, audience?: StoryAudience): boolean {
  if (!extra || typeof extra !== 'object' || !('storyAudience' in extra)) return true;
  const parsed = storyAudienceSchema.safeParse((extra as Record<string, unknown>).storyAudience);
  if (!parsed.success || !audience?.length) return false;
  return parsed.data.includes(characterId) && audience.every(id => parsed.data.includes(id));
}

export function storyAudienceExtra(audience?: StoryAudience): Record<string, unknown> {
  return audience ? { storyAudience: [...audience].sort() } : {};
}
