import { z } from 'zod';
import { openingDisplayText } from './story-opening';

export const storyRecommendationsSchema = z.array(z.object({
  label: z.string().trim().min(1).max(80), input: z.string().trim().min(1).max(500),
}).strict()).length(3).refine(items => new Set(items.map(item => item.input)).size === 3
  && new Set(items.map(item => item.label)).size === 3);
export type StoryRecommendation = z.infer<typeof storyRecommendationsSchema>[number];
export type StoryRecommendationsSource = 'generated' | 'excerpt' | 'fallback';

export function sourcedStoryRecommendations(content: string) {
  const excerpt = openingDisplayText(content.split('\n<story-intent>')[0]).split('\n')
    .filter(line => line.length >= 8 && !/[{}=]/.test(line)).at(-1)?.slice(0, 60).trim();
  return {
    storyRecommendationsSource: (excerpt ? 'excerpt' : 'fallback') as StoryRecommendationsSource,
    storyRecommendations: [
      { label: '观察当前情景', input: '我先观察当前情景，留意可以进一步了解的细节。' },
      { label: excerpt ? `追问：${excerpt.slice(0, 18)}${excerpt.length > 18 ? '…' : ''}` : '追问刚才的细节',
        input: excerpt ? `关于刚才提到的“${excerpt}”，我想了解更多细节，先不采取行动。` : '请结合刚才的剧情，说明一个我可以继续追问的细节。' },
      { label: '了解可选行动', input: '结合当前情景，我现在可以尝试哪些行动？请说明可能性，不替我执行或作决定。' },
    ],
  };
}
