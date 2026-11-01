<template>
  <button type="button" class="branch-navigation-toggle chat-header-icon" aria-label="分支存档" title="分支存档" aria-haspopup="dialog" :aria-expanded="drawer" @click="drawer = true">
    <span aria-hidden="true">⑂</span><span class="chat-tool-label">分支存档</span>
  </button>
  <StoryWorkspaceDrawer v-model:open="drawer" title="分支存档">
    <p class="branch-navigation-hint">每一次不同的选择，都有独立的存档。切换只恢复存档，不自动续写。</p>
    <StoryBranchFamily :chat-id="chatId" :owner-id="ownerId" @select="select" />
  </StoryWorkspaceDrawer>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import StoryBranchFamily from './StoryBranchFamily.vue';
import StoryWorkspaceDrawer from './StoryWorkspaceDrawer.vue';
defineProps<{ chatId: string; ownerId: string }>();
const router = useRouter();
const drawer = ref(false);
async function select(chatId: string) {
  await router.push({ name: 'ChatSession', params: { chatId } });
  drawer.value = false;
}
</script>
<style scoped>
.branch-navigation-toggle { display:flex; align-items:center; justify-content:center; gap:8px; min-height:40px; padding:8px 10px; border:0; border-radius:8px; background:transparent; color:var(--text-secondary); cursor:pointer; font:inherit; font-size:13px; }
.branch-navigation-toggle:hover { background:var(--bg-subtle); }
.branch-navigation-toggle > span:first-child { font-size:21px; line-height:1; }
.branch-navigation-hint { margin:0 0 20px; color:var(--text-secondary); font-size:13px; line-height:1.8; }
@media(max-width:1100px) { .chat-tool-label { display:none; } }
</style>
