<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import FavoriteButton from '@client/components/social/FavoriteButton.vue';
import { cleanDescription } from '@client/utils/sillytavern';
import type { Character } from '@client/types';
import { storyIntroduction } from '../../../types/story-opening';

const props = defineProps<{ character: Character; preview?: boolean; quickStart?: boolean }>();
const { t } = useI18n();
const coverFailed = ref(false);
watch(() => props.character.avatar, () => { coverFailed.value = false; });
const summary = computed(() => cleanDescription(storyIntroduction(props.character.description, props.character.cardData ?? {}, props.character.presentation).text, props.character.name, 180));
const tags = computed(() => [...new Set(props.character.tags || [])].slice(0, 3));
</script>

<template>
  <article class="story-card">
    <component :is="preview ? 'div' : RouterLink" class="story-link" :to="preview ? undefined : { name: 'CharacterDetail', params: { id: character.id } }">
      <div class="story-cover" aria-hidden="true">
        <img v-if="character.avatar && !coverFailed" :src="character.avatar" alt="" loading="lazy" @error="coverFailed = true" />
        <span v-else class="cover-initial">{{ character.name.slice(0, 1) }}</span>
      </div>
      <div class="story-copy">
        <h2>{{ character.name }}</h2>
        <p>{{ summary || t('market.noDescription') }}</p>
        <ul v-if="tags.length" class="story-tags" :aria-label="t('market.filters.tags')">
          <li v-for="tag in tags" :key="tag">{{ tag }}</li>
        </ul>
        <span v-if="!preview && !quickStart" class="story-action">{{ t('market.discovery.viewStory') }} <span aria-hidden="true">↗</span></span>
      </div>
    </component>
    <div v-if="!preview && quickStart" class="story-entry-actions">
      <RouterLink class="story-quick-start" :to="{ name: 'Chat', query: { characterId: character.id, storyEntry: 'quick' } }" :aria-label="t('exploration.startNamed', { name: character.name })">{{ t('exploration.quickStart') }} <span aria-hidden="true">→</span></RouterLink>
      <RouterLink class="story-detail-link" :to="{ name: 'CharacterDetail', params: { id: character.id } }">{{ t('market.discovery.viewStory') }}</RouterLink>
    </div>
    <div v-if="!preview" class="story-favorite">
      <FavoriteButton :character-id="character.id" :character-name="character.name" :show-count="false" />
    </div>
  </article>
</template>

<style scoped lang="scss">
.story-card {
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-card);
  background: var(--bg-surface);
}

.story-link {
  display: flex;
  flex-direction: column;
  flex: 1;
  color: var(--text-primary);
  text-decoration: none;
}

.story-link:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: -3px;
}

.story-cover {
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 10;
  background: radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 65%), var(--bg-subtle);
  overflow: hidden;
}

.story-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-initial { font-family: var(--font-display); font-size: 64px; color: var(--accent-text); }
.story-copy { display: flex; flex: 1; flex-direction: column; gap: 12px; padding: 20px; }
h2 { margin: 0; font-family:var(--font-display); font-weight:500; font-size: 24px; line-height: 1.4; overflow-wrap: anywhere; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
p { margin: 0; color: var(--text-secondary); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.story-tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 0; list-style: none; }
.story-tags li { max-width: 100%; padding: 3px 8px; border-radius: 6px; background: var(--bg-subtle); color: var(--text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.story-action { margin-top: auto; padding: 12px 52px 0 0; min-height: 44px; color: var(--accent-text); font-size: 14px; font-weight: 600; }
.story-favorite { position: absolute; right: 12px; bottom: 12px; }
.story-favorite :deep(.favorite-button) { min-width: 44px; min-height: 44px; margin: 0; }
.story-entry-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 0 64px 22px 22px; }
.story-quick-start { display: inline-flex; align-items: center; justify-content: center; gap: 20px; min-height: 44px; padding: 10px 18px; border-radius: 8px; background: var(--accent); color: var(--accent-on); text-decoration: none; font-size: 14px; }
.story-detail-link { display: inline-flex; align-items: center; min-height: 44px; color: var(--text-secondary); font-size: 12px; }

@include below(sm) {
  .story-cover { aspect-ratio: 16 / 9; }
  .cover-initial { font-size: 44px; }
  .story-copy { min-width: 0; padding: 16px; gap: 10px; }
  h2 { font-size: 18px; }
  p { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
}

@media (prefers-reduced-motion: no-preference) {
  .story-card { transition: border-color 0.2s; }
  .story-card:hover { border-color: var(--accent); }
}
</style>
