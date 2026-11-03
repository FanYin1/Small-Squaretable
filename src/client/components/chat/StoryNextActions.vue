<template>
  <div v-if="actions.length || recommendations.length" class="story-next-actions">
    <section v-if="actions.length" class="story-actions" aria-label="故事行动">
      <ul>
        <li v-for="action in actions" :key="action.id">
          <button type="button" class="story-action-choice" :disabled="actionBlocked" @click="emit('action', action)">
            <span class="story-action-intent">{{ actionIntents[action.intent] }}</span>
            <span class="story-action-label">{{ action.label }}</span>
            <span aria-hidden="true">→</span>
          </button>
        </li>
      </ul>
    </section>
    <section v-if="recommendations.length" class="story-actions turn-recommendations" :class="{ 'opening-suggestions': opening }" aria-label="本轮推荐行动">
      <p class="story-recommendations-lead">{{ leadText }}</p>
      <ul>
        <li v-for="suggestion in recommendations" :key="suggestion.label">
          <button type="button" class="story-action-choice" :disabled="recommendationBlocked" @click="emit('suggest', suggestion.input)">
            <span class="story-action-label">{{ suggestion.label }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { StoryStateView } from '../../../types/story-state';
import { DEFAULT_STORY_RECOMMENDATIONS_LEAD, storyRecommendationsLeadTextSchema, type StoryRecommendation } from '../../../types/story-recommendations';

const props = defineProps<{
  actions: StoryStateView['actions'];
  recommendations: StoryRecommendation[];
  lead?: string;
  opening: boolean;
  actionBlocked: boolean;
  recommendationBlocked: boolean;
}>();
const leadText = computed(() => {
  const parsed = storyRecommendationsLeadTextSchema.safeParse(props.lead);
  return parsed.success ? parsed.data : DEFAULT_STORY_RECOMMENDATIONS_LEAD;
});
const emit = defineEmits<{
  action: [action: StoryStateView['actions'][number]];
  suggest: [input: string];
}>();
const actionIntents = { observe: '观察', talk: '交谈', act: '行动', travel: '前往' };
</script>

<style scoped>
.story-next-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; width: 100%; margin: 8px 0 0; }
.story-actions { min-width: 0; max-width: 100%; margin: 0; }
.story-recommendations-lead { margin: 0 0 8px; color: var(--text-secondary); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.story-actions ul { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; list-style: none; padding: 0; margin: 0; }
.story-actions li { min-width: 0; max-width: 100%; padding: 0; margin: 0; }
.story-action-intent { font-size: 11px; color: var(--text-secondary); flex-shrink: 0; }
.story-action-label { font-size: 13px; overflow-wrap: anywhere; }
.story-action-choice { display: flex; align-items: center; gap: 8px; min-height: 44px; max-width: 100%; padding: 8px 12px; border: 1px solid var(--border-default); background: var(--bg-subtle); color: var(--accent); border-radius: 6px; text-align: left; cursor: pointer; }
.story-action-choice:disabled { opacity: .5; cursor: default; }
</style>
