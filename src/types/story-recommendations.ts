import { z } from 'zod';

export const storyRecommendationsSchema = z.array(z.object({
  label: z.string().trim().min(1).max(32), input: z.string().trim().min(1).max(240),
}).strict()).length(3).refine(items => new Set(items.map(item => item.input)).size === 3
  && new Set(items.map(item => item.label)).size === 3);
export type StoryRecommendation = z.infer<typeof storyRecommendationsSchema>[number];
export type StoryRecommendationsSource = 'generated' | 'excerpt' | 'fallback';

export const DEFAULT_STORY_RECOMMENDATIONS_LEAD = '你可以从下面的方向继续，也可以直接输入自己的想法。';
export const storyRecommendationsLeadTextSchema = z.string().trim().min(1).max(120)
  .refine(text => !/[<>]/.test(text) && ![...text].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127));
export const storyRecommendationsLeadSchema = z.object({
  text: storyRecommendationsLeadTextSchema,
  evidence: z.string().trim().min(2).max(300),
}).strict();

export function parseStoryRecommendationsLead(value: unknown, content: string): string | undefined {
  const parsed = storyRecommendationsLeadSchema.safeParse(value);
  return parsed.success && content.includes(parsed.data.evidence) ? parsed.data.text : undefined;
}

export function sourcedStoryRecommendations(_content: string) {
  return {
    // A fallback must remain useful without pretending that an arbitrary
    // sentence from the previous response is a grounded recommendation.
    storyRecommendationsSource: 'fallback' as StoryRecommendationsSource,
    storyRecommendationsLead: DEFAULT_STORY_RECOMMENDATIONS_LEAD,
    storyRecommendations: [
      { label: '观察现场', input: '我先观察当前情景，留意刚才回复中的细节。' },
      { label: '追问细节', input: '我想追问刚才回复中的一个细节，先不采取行动。' },
      { label: '暂缓决定', input: '我先不做决定，继续观察当前情况。' },
    ],
  };
}
