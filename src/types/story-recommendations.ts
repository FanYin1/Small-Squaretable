import { z } from 'zod';

export const storyRecommendationsSchema = z.array(z.object({
  label: z.string().trim().min(1).max(32), input: z.string().trim().min(1).max(240),
}).strict()).length(3).refine(items => new Set(items.map(item => item.input)).size === 3
  && new Set(items.map(item => item.label)).size === 3);
export type StoryRecommendation = z.infer<typeof storyRecommendationsSchema>[number];
export type StoryRecommendationsSource = 'generated' | 'excerpt' | 'fallback';

export function sourcedStoryRecommendations(content: string) {
  return {
    // A fallback must remain useful without pretending that an arbitrary
    // sentence from the previous response is a grounded recommendation.
    storyRecommendationsSource: 'fallback' as StoryRecommendationsSource,
    storyRecommendations: [
      { label: '观察现场', input: '我先观察当前情景，留意刚才回复中的细节。' },
      { label: '追问细节', input: '我想追问刚才回复中的一个细节，先不采取行动。' },
      { label: '暂缓决定', input: '我先不做决定，继续观察当前情况。' },
    ],
  };
}
