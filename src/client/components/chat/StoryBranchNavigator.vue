<template>
  <aside class="story-branch-navigation" :class="{ collapsed: !expanded, mobile }" aria-label="独立分支导航">
    <button ref="trigger" type="button" class="branch-navigation-toggle" :aria-expanded="mobile ? drawer : expanded" aria-controls="story-branch-navigation-content" @click="mobile ? drawer = true : expanded = !expanded">
      <span aria-hidden="true">⑂</span><span v-if="mobile || expanded">分支存档</span>
      <span v-else class="sr-only">展开分支存档</span>
    </button>
    <div v-if="!mobile && expanded" id="story-branch-navigation-content">
      <p class="branch-navigation-hint">每一次不同的选择，都有独立的存档。</p>
      <StoryBranchFamily :chat-id="chatId" :owner-id="ownerId" @select="select" />
    </div>
    <el-drawer v-if="mobile" v-model="drawer" title="分支存档" direction="ltr" size="min(340px, 90vw)" @closed="trigger?.focus()">
      <div id="story-branch-navigation-content">
        <p class="branch-navigation-hint">切换只恢复存档，不自动续写。</p>
        <StoryBranchFamily :chat-id="chatId" :owner-id="ownerId" @select="select" />
      </div>
    </el-drawer>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import StoryBranchFamily from './StoryBranchFamily.vue';

defineProps<{ chatId: string; ownerId: string }>();
const router = useRouter();
const media = window.matchMedia('(max-width: 1023px)');
const mobile = ref(media.matches);
const updateMedia = () => { mobile.value = media.matches; };
media.addEventListener('change', updateMedia);
onBeforeUnmount(() => media.removeEventListener('change', updateMedia));
const expanded = ref(true);
const drawer = ref(false);
const trigger = ref<HTMLButtonElement>();
async function select(chatId: string) {
  await router.push({ name: 'ChatSession', params: { chatId } });
  drawer.value = false;
}
</script>

<style scoped>
.story-branch-navigation { flex: 0 0 208px; min-width: 0; overflow-y: auto; border-right: 1px solid var(--border-default); background: var(--bg-subtle); }
.story-branch-navigation.collapsed { flex-basis: 48px; }
.branch-navigation-toggle { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 14px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 13px; }
.branch-navigation-hint { margin: 8px 14px; font-size: 12px; color: var(--text-secondary); line-height: 1.7; }
.story-branch-navigation.mobile { flex: 0 0 auto; overflow: visible; border-right: 0; border-bottom: 1px solid var(--border-default); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>
