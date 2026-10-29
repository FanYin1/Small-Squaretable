<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import StoryCard from '@client/components/market/StoryCard.vue';
import MarkdownRenderer from '@client/components/chat/MarkdownRenderer.vue';
import type { Character } from '@client/types';

const props = defineProps<{
  name: string;
  description: string;
  avatarUrl: string;
  personality: string;
  firstMessage: string;
  tags: string[];
  category: string;
}>();
const { t } = useI18n();
const character = computed<Character>(() => ({
  id: '',
  name: props.name || t('storyShell.untitled'),
  description: props.description,
  avatar: props.avatarUrl,
  tags: props.tags,
  category: props.category,
  isPublic: false,
  createdAt: '',
}));
const opening = computed(() => props.firstMessage
  .replace(/\{\{char\}\}/gi, () => character.value.name)
  .replace(/\{\{user\}\}/gi, () => t('chat.you')));
</script>

<template>
  <aside class="character-preview" :aria-label="t('storyShell.preview')">
    <h2>{{ t('storyShell.preview') }}</h2>
    <p class="preview-hint">{{ t('storyShell.previewHint') }}</p>
    <StoryCard :character="character" preview />
    <section class="preview-opening">
      <h3>{{ t('characterDetail.opening') }}</h3>
      <MarkdownRenderer v-if="opening" :content="opening" />
      <p v-else class="preview-hint">{{ t('storyShell.noOpening') }}</p>
    </section>
  </aside>
</template>

<style scoped>
.character-preview { position:sticky; top:24px; min-width:0; }
h2,h3 { font-family:var(--font-display); font-weight:500; color:var(--text-primary); }
h2 { font-size:24px; margin:0 0 12px; }
h3 { font-size:20px; margin:0 0 20px; }
.preview-hint { color:var(--text-secondary); font-size:14px; line-height:1.75; margin:0 0 20px; }
.preview-opening { margin-top:24px; padding:24px; border:1px solid var(--border-default); border-radius:var(--radius-card); background:var(--bg-surface); }
.preview-opening :deep(.markdown-content) { font-size:var(--chat-font-size,17px); line-height:1.75; overflow-wrap:anywhere; }
</style>
