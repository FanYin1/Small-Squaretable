import { describe, expect, it } from 'vitest';
import { sourcedStoryRecommendations, storyRecommendationsSchema } from './story-recommendations';

describe('story recommendations', () => {
  it('derives opening prompts from visible source without treating hidden card controls as story text', () => {
    const content = '<VariableInsert>{"secret":42}</VariableInsert><script>secret()</script>\n你看见甲板尽头闪着微弱的蓝光。';
    const result = sourcedStoryRecommendations(content);
    expect(result.storyRecommendationsSource).toBe('excerpt');
    expect(result.storyRecommendations[1].input).toContain('甲板尽头');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(storyRecommendationsSchema.safeParse(result.storyRecommendations).success).toBe(true);
  });
  it('keeps fallback deterministic across reloads, changes with the visible scene, and handles empty openings', () => {
    const first = sourcedStoryRecommendations('你看见甲板尽头闪着微弱的蓝光。');
    expect(sourcedStoryRecommendations('你看见甲板尽头闪着微弱的蓝光。')).toEqual(first);
    expect(sourcedStoryRecommendations('房间里传来了向导清晰的脚步声。')).not.toEqual(first);
    expect(sourcedStoryRecommendations('').storyRecommendationsSource).toBe('fallback');
  });
  it('rejects duplicate suggestions and numeric effects', () => {
    const items = sourcedStoryRecommendations('').storyRecommendations;
    expect(storyRecommendationsSchema.safeParse([items[0], items[0], items[1]]).success).toBe(false);
    expect(storyRecommendationsSchema.safeParse([{ ...items[0], changes: { coins: 100 } }, ...items.slice(1)]).success).toBe(false);
  });
});
