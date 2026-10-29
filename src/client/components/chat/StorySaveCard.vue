<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Chat } from '@client/types';
import { Delete } from '@element-plus/icons-vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useChatStore } from '@client/stores/chat';

const props = defineProps<{ story: Chat }>();
const { t, locale } = useI18n();
const chatStore = useChatStore();
const deleting = ref(false);
async function deleteStory() {
  if (deleting.value) return;
  const id = props.story.id;
  deleting.value = true;
  try {
    try {
      await ElMessageBox.confirm(t('chat.deleteConfirm'), `${t('chat.deleteTitle')} · ${title.value}`, {
        confirmButtonText: t('common.delete'), cancelButtonText: t('common.cancel'), type: 'warning',
      });
    } catch { return; }
    await chatStore.deleteChat(id);
    ElMessage.success(t('chat.deleteSuccess'));
  } catch {
    ElMessage.error(t('chat.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}
const coverFailed = ref(false);
watch(() => props.story.characterAvatar, () => { coverFailed.value = false; });
const title = computed(() => props.story.title || props.story.characterName || t('exploration.untitledStory'));
const updated = computed(() => {
  if (!props.story.lastMessageAt) return null;
  const date = new Date(props.story.lastMessageAt);
  return Number.isFinite(date.getTime()) ? { iso: date.toISOString(), text: date.toLocaleDateString(locale.value) } : null;
});
</script>

<template>
  <article class="library-story">
    <button type="button" class="library-delete" :disabled="deleting" :aria-busy="deleting"
      :aria-label="`${t('common.delete')} ${title}`" :title="t('common.delete')" @click.stop="deleteStory">
      <Delete aria-hidden="true" /><span>{{ t('common.delete') }}</span>
    </button>
    <RouterLink class="library-cover" :to="{ name: 'ChatSession', params: { chatId: story.id } }" :aria-label="t('exploration.resumeNamed', { name: title })">
      <img v-if="story.characterAvatar && !coverFailed" :src="story.characterAvatar" alt="" loading="lazy" @error="coverFailed = true" />
      <span v-else aria-hidden="true">{{ title.slice(0, 1) }}</span>
    </RouterLink>
    <div class="library-copy">
      <p v-if="story.characterName && story.characterName !== title" class="library-character">{{ story.characterName }}</p>
      <h2><RouterLink :to="{ name: 'ChatSession', params: { chatId: story.id } }">{{ title }}</RouterLink></h2>
      <p class="library-excerpt">{{ story.lastMessage || t('exploration.noExcerpt') }}</p>
      <div class="library-meta">
        <time v-if="updated" :datetime="updated.iso">{{ t('exploration.updated', { date: updated.text }) }}</time>
        <RouterLink v-if="story.characterId" :to="{ name: 'Chat', query: { characterId: story.characterId, storyEntry: 'quick' } }">{{ t('storyShell.startAnother') }}</RouterLink>
      </div>
    </div>
    <RouterLink class="library-resume" :to="{ name: 'ChatSession', params: { chatId: story.id } }">{{ t('market.discovery.resume') }} →</RouterLink>
  </article>
</template>

<style scoped lang="scss">
.library-delete { position: absolute; top: 10px; right: 12px; display: inline-flex; align-items: center; gap: 6px; min-width: 72px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--border-default); border-radius: 8px; color: var(--text-secondary); background: var(--bg-surface); font: inherit; cursor: pointer; }
.library-delete svg { width: 16px; height: 16px; }
.library-delete:hover { color: var(--el-color-danger); border-color: currentColor; }
.library-delete:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.library-delete:disabled { opacity: .6; cursor: wait; }
.library-story { position: relative; display: grid; grid-template-columns: 180px minmax(0, 1fr) auto; align-items: center; gap: 28px; padding: 64px 20px 20px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--bg-surface); }
.library-cover { height: 160px; display: grid; place-items: center; border-radius: 8px; overflow: hidden; background: var(--bg-subtle); text-decoration: none; color: var(--accent-text); font: 48px var(--font-display); }
.library-cover img { width: 100%; height: 100%; object-fit: cover; }
.library-copy { min-width: 0; }
.library-character { margin: 0 0 8px; color: var(--accent-text); font-size: 12px; }
h2 { font: 500 26px/1.4 var(--font-display); margin: 0 0 12px; overflow-wrap: anywhere; }
h2 a { color: var(--text-primary); text-decoration: none; }
.library-excerpt { margin: 0; line-height: 1.9; font-size: 14px; color: var(--text-secondary); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.library-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 20px; margin-top: 12px; font-size: 12px; color: var(--text-secondary); }
.library-meta a { display: inline-flex; align-items: center; min-height: 44px; color: var(--text-secondary); }
.library-resume { display: inline-flex; align-items: center; min-height: 44px; padding: 10px 18px; border: 1px solid var(--border-interactive); border-radius: 8px; text-decoration: none; color: var(--accent-text); font-size: 14px; }
@include below(md) { .library-story { grid-template-columns: minmax(60px, 100px) minmax(0, 1fr); gap: 16px; padding: 64px 16px 16px; } .library-cover { height: 140px; } h2 { font-size: 22px; } .library-resume { grid-column: 1 / -1; justify-content: center; } }
</style>
