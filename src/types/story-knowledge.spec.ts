import { describe, expect, it } from 'vitest';
import { storyAudienceSchema, storyAudienceExtra, storyKnowledgeVisible } from './story-knowledge';

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

describe('story knowledge boundary', () => {
  it('keeps public history accessible in either conversation', () => {
    expect(storyKnowledgeVisible(null, first)).toBe(true);
    expect(storyKnowledgeVisible({ clientMessageId: 'old' }, second, [second])).toBe(true);
  });
  it('excludes private content from a different character and from public responses', () => {
    const extra = storyAudienceExtra([first]);
    expect(storyKnowledgeVisible(extra, first, [first])).toBe(true);
    expect(storyKnowledgeVisible(extra, second, [second])).toBe(false);
    expect(storyKnowledgeVisible(extra, first)).toBe(false);
    expect(storyKnowledgeVisible(extra, first, [first, second])).toBe(false);
  });
  it('allows a smaller audience to recall shared information', () => {
    expect(storyKnowledgeVisible(storyAudienceExtra([first, second]), first, [first])).toBe(true);
  });
  it.each([null, [], 'public', ['not-an-id'], [first, first]])('fails closed for malformed persisted permissions: %j', value => {
    expect(storyKnowledgeVisible({ storyAudience: value }, first, [first])).toBe(false);
  });
  it('requires an explicit nonempty unique audience', () => {
    expect(storyAudienceSchema.safeParse([]).success).toBe(false);
    expect(storyAudienceSchema.safeParse([first, first]).success).toBe(false);
    expect(storyAudienceSchema.safeParse([first]).success).toBe(true);
  });
});
