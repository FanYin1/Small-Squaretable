import { describe, expect, it } from 'vitest';
import { DEFAULT_STORY_RECOMMENDATIONS_LEAD, parseStoryRecommendationsLead, sourcedStoryRecommendations, storyRecommendationsSchema } from './story-recommendations';

describe('story recommendations', () => {
  it('accepts a bounded paragraph with evidence from this reply only', () => {
    const lead = { text: '门边的痕迹值得留意，你也可以选择自己的行动。', evidence: '门边留下了划痕' };
    expect(parseStoryRecommendationsLead(lead, '你发现门边留下了划痕。')).toBe(lead.text);
    expect(parseStoryRecommendationsLead(lead, '你已经离开房间。')).toBeUndefined();
    expect(parseStoryRecommendationsLead({ ...lead, evidence: '门' }, '门')).toBeUndefined();
  });
  it.each(['', '字'.repeat(121), '<script>alert(1)</script>', '第一段\n第二段', '隐藏\u0000控制符'])(
    'drops malformed guidance without extracting arbitrary reply text: %j', text => {
      expect(parseStoryRecommendationsLead({ text, evidence: '门边留下了划痕' }, '门边留下了划痕')).toBeUndefined();
    },
  );
  it('uses safe fallback prompts without treating story text or hidden card controls as recommendation data', () => {
    const content = '<VariableInsert>{"secret":42}</VariableInsert><script>secret()</script>\n你看见甲板尽头闪着微弱的蓝光。';
    const result = sourcedStoryRecommendations(content);
    expect(result.storyRecommendationsSource).toBe('fallback');
    expect(result.storyRecommendationsLead).toBe(DEFAULT_STORY_RECOMMENDATIONS_LEAD);
    expect(result.storyRecommendations[1].input).not.toContain('甲板尽头');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(storyRecommendationsSchema.safeParse(result.storyRecommendations).success).toBe(true);
  });
  it('keeps fallback recommendations deterministic and independent from the previous response', () => {
    const first = sourcedStoryRecommendations('你看见甲板尽头闪着微弱的蓝光。');
    expect(sourcedStoryRecommendations('你看见甲板尽头闪着微弱的蓝光。')).toEqual(first);
    expect(sourcedStoryRecommendations('房间里传来了向导清晰的脚步声。')).toEqual(first);
    expect(sourcedStoryRecommendations('').storyRecommendationsSource).toBe('fallback');
  });
  it('rejects duplicate suggestions and numeric effects', () => {
    const items = sourcedStoryRecommendations('').storyRecommendations;
    expect(storyRecommendationsSchema.safeParse([items[0], items[0], items[1]]).success).toBe(false);
    expect(storyRecommendationsSchema.safeParse([{ ...items[0], changes: { coins: 100 } }, ...items.slice(1)]).success).toBe(false);
    expect(storyRecommendationsSchema.safeParse([{ ...items[0], label: '过长'.repeat(20) }, items[1], items[2]]).success).toBe(false);
  });
});
