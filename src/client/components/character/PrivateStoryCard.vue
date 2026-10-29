<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { cleanDescription } from '@client/utils/sillytavern';
import { storyIntroduction } from '../../../types/story-opening';
import type { Character } from '@client/types';

const props = defineProps<{ character: Character; canPublish: boolean }>();
const emit = defineEmits<{
  enter: [];
  view: [];
  edit: [];
  manage: [command: string];
}>();
const { t } = useI18n();
const coverFailed = ref(false);
watch(() => props.character.avatar, () => { coverFailed.value = false; });
const summary = computed(() => cleanDescription(storyIntroduction(props.character.description,
  props.character.cardData ?? {}, props.character.presentation).text, props.character.name, 140));
const tags = computed(() => [...new Set(props.character.tags ?? [])].slice(0, 3));
</script>

<template>
  <article class="private-story-card" :aria-label="character.name">
    <button type="button" class="private-story-preview" :aria-label="`${t('market.discovery.viewStory')}: ${character.name}`" @click="emit('view')">
      <span class="private-story-cover" aria-hidden="true">
        <img v-if="character.avatar && !coverFailed" :src="character.avatar" alt="" loading="lazy" @error="coverFailed = true" />
        <span v-else class="cover-initial">{{ character.name.slice(0, 1) }}</span>
      </span>
      <span class="private-story-copy">
        <span class="private-story-label">{{ t(character.isPublic ? 'privateLibrary.publishedWork' : 'privateLibrary.privateWork') }}<span v-if="character.isNsfw"> · 18+</span></span>
        <span class="private-story-name">{{ character.name }}</span>
        <span class="private-story-summary">{{ summary || t('privateLibrary.noSummary') }}</span>
      </span>
    </button>
    <ul v-if="tags.length" class="private-story-tags" :aria-label="t('characterDetail.tags')">
      <li v-for="tag in tags" :key="tag" :title="tag">{{ tag }}</li>
    </ul>
    <div class="private-story-status"><slot name="status" /></div>
    <footer class="private-story-actions">
      <button type="button" class="private-story-enter" :aria-label="t('exploration.startNamed', { name: character.name })" @click="emit('enter')">{{ t('characterDetail.enterStory') }} <span aria-hidden="true">→</span></button>
      <button type="button" class="private-story-edit" :aria-label="`${t('common.edit')}: ${character.name}`" @click="emit('edit')">{{ t('common.edit') }}</button>
      <el-dropdown trigger="click" popper-class="private-story-menu" @command="emit('manage', $event)">
        <button type="button" class="private-story-more" :aria-label="t('privateLibrary.manageNamed', { name: character.name })">{{ t('privateLibrary.more') }} <span aria-hidden="true">⋯</span></button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="!character.isPublic" command="publish">{{ t(canPublish ? 'myCharacters.publish' : 'privateLibrary.publishPreview') }}</el-dropdown-item>
            <el-dropdown-item v-else command="unpublish">{{ t('myCharacters.unpublish') }}</el-dropdown-item>
            <el-dropdown-item command="export">{{ t('common.export') }}</el-dropdown-item>
            <el-dropdown-item command="duplicate">{{ t('myCharacters.duplicate') }}</el-dropdown-item>
            <el-dropdown-item command="delete" divided>{{ t('common.delete') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </footer>
  </article>
</template>

<style scoped>
.private-story-card { height: 100%; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--border-default); border-radius: 14px; background: var(--bg-surface); }
.private-story-preview { display: flex; flex-direction: column; padding: 0; border: 0; background: transparent; color: var(--text-primary); text-align: start; cursor: pointer; font: inherit; }
.private-story-cover { display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 13px 13px 0 0; background: radial-gradient(ellipse at 30% 30%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 70%), var(--bg-subtle); }
.private-story-cover img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; }
.cover-initial { color: var(--accent-text); font-family: var(--font-display); font-size: 60px; }
.private-story-copy { display: flex; flex-direction: column; gap: 10px; padding: 22px 22px 12px; min-width: 0; width: 100%; }
.private-story-label { font-size: 11px; letter-spacing: .08em; color: var(--text-secondary); }
.private-story-name { font: 500 25px/1.4 var(--font-display); overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.private-story-summary { font-size: 14px; line-height: 1.8; color: var(--text-secondary); overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.private-story-tags { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0 22px; margin: 2px 0 16px; }
.private-story-tags li { padding: 4px 8px; background: var(--bg-subtle); border-radius: 4px; font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.private-story-status:empty { display: none; }
.private-story-status { padding: 0 22px 12px; }
.private-story-actions { display: flex; align-items: center; gap: 8px; padding: 16px; border-top: 1px solid var(--border-subtle); margin-top: auto; }
.private-story-actions button { min-height: 44px; border: 0; border-radius: 7px; cursor: pointer; font: inherit; font-size: 13px; }
.private-story-enter { display: flex; flex: 1; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: var(--accent); color: var(--accent-on); }
.private-story-enter:hover { background: var(--accent-hover); }
.private-story-edit, .private-story-more { padding: 8px; background: transparent; color: var(--text-secondary); }
.private-story-edit:hover, .private-story-more:hover { background: var(--bg-subtle); color: var(--text-primary); }
.private-story-preview:focus-visible { outline-offset: -3px; border-radius: 13px; }
:global(.private-story-menu .el-dropdown-menu__item) { min-height: 44px; }
@media (max-width: 479px) {
  .private-story-preview { flex-direction: row; align-items: stretch; }
  .private-story-cover { width: 96px; flex-shrink: 0; min-height: 144px; aspect-ratio: auto; border-radius: 13px 0 0 0; }
  .private-story-copy { padding: 16px 14px 12px; gap: 8px; }
  .private-story-name { font-size: 21px; }
  .private-story-summary { font-size: 13px; line-height: 1.7; }
  .private-story-tags { padding: 0 14px; margin-block: 8px 12px; }
}
</style>
