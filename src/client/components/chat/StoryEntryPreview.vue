<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { characterApi } from '@client/services/character.api';
import { cleanDescription } from '@client/utils/sillytavern';
import type { Character } from '@client/types';
import StoryCompatibility from '../character/StoryCompatibility.vue';
import type { OpeningSelection, StoryEntryProfile } from '../../../types/story-opening';
import { storyDisplayText } from '@client/utils/story-display';

const props = defineProps<{ characterId: string; entryProfile?: StoryEntryProfile | null; opening?: OpeningSelection | null }>();
const { t } = useI18n();
const character = ref<Character | null>(null);
const failed = ref(false);
const loading = ref(false);
const coverFailed = ref(false);
const description = computed(() => character.value ? cleanDescription(character.value.description, character.value.name, 400) : '');
const selected = computed(() => props.entryProfile?.openings.find(item => item.reference.source === props.opening?.reference.source && item.reference.index === props.opening?.reference.index));
const openingPreview = computed(() => storyDisplayText(selected.value?.preview, { characterName: props.entryProfile?.name, userName: t('storyEntry.you'), limit: 1200, multiline: true }));
let version = 0;
async function load() {
  const requestVersion = ++version;
  if (props.entryProfile) return;
  character.value = null;
  failed.value = false;
  coverFailed.value = false;
  loading.value = true;
  try {
    const result = await characterApi.getCharacter(props.characterId);
    if (requestVersion === version) character.value = result;
  } catch {
    if (requestVersion === version) failed.value = true;
  } finally {
    if (requestVersion === version) loading.value = false;
  }
}
watch(() => props.characterId, load, { immediate: true });
onScopeDispose(() => { version++; });
</script>

<template>
  <div class="entry-preview" :aria-busy="loading">
    <p class="entry-eyebrow">{{ t('exploration.optionalIdentity') }}</p>
    <template v-if="entryProfile">
      <h2>{{ entryProfile.name }}</h2>
      <p class="selected-opening">{{ openingPreview || t('storyEntry.withoutOpeningHint') }}</p>
      <p v-if="entryProfile.identity.status === 'fixed_name'">{{ t('storyEntry.fixedIdentity', { name: entryProfile.identity.fixedName }) }}</p>
      <RouterLink :to="{ name: 'CharacterDetail', params: { id: characterId } }">{{ t('market.discovery.viewStory') }} →</RouterLink>
    </template>
    <p v-else-if="loading" role="status">{{ t('common.loading') }}</p>
    <div v-else-if="failed" role="alert"><p>{{ t('exploration.previewFailed') }}</p><el-button @click="load">{{ t('common.retry') }}</el-button></div>
    <template v-else-if="character">
      <h2>{{ character.name }}</h2>
      <p>{{ description || t('market.noDescription') }}</p>
      <StoryCompatibility :card-data="character.cardData" :character-id="character.id" />
      <div class="entry-art" aria-hidden="true">
        <img v-if="character.avatar && !coverFailed" :src="character.avatar" alt="" @error="coverFailed = true" />
        <span v-else>{{ character.name.slice(0, 1) }}</span>
      </div>
      <RouterLink :to="{ name: 'CharacterDetail', params: { id: characterId } }">{{ t('market.discovery.viewStory') }} →</RouterLink>
    </template>
  </div>
</template>

<style scoped lang="scss">
.entry-eyebrow { color: var(--accent-text); font-size: 12px; letter-spacing: .08em; }
.selected-opening { white-space: pre-wrap; }
h2 { font: 500 clamp(32px, 4vw, 48px)/1.4 var(--font-display); margin: 16px 0 20px; overflow-wrap: anywhere; }
p { color: var(--text-secondary); line-height: 1.9; overflow-wrap: anywhere; }
.entry-art { height: 270px; margin: 28px 0 16px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--bg-surface); overflow: hidden; display: grid; place-items: center; }
.entry-art img { width: 100%; height: 100%; object-fit: cover; }
.entry-art span { font: 64px var(--font-display); color: var(--accent-text); }
a { display: inline-flex; align-items: center; min-height: 44px; color: var(--accent-text); }
@include below(md) { .entry-art { height: 180px; } }
</style>
