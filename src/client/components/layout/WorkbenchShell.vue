<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { House, Collection, ChatDotRound, EditPen, Close, Plus, User } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores/user';
import { useTheme } from '@client/composables/useTheme';
import { workbenchSection, workbenchNavigation } from './workbench';
import StoryBrand from './StoryBrand.vue';
import WorkbenchNavigationToggle from './WorkbenchNavigationToggle.vue';
import '@client/styles/exploration-entry.css';
import '@client/styles/workbench-paper.css';

const { t } = useI18n();
const route = useRoute();
const user = useUserStore();
const { theme, toggleTheme } = useTheme();
const section = ref<string>();
provide(workbenchSection, section);
const storageKey = 'squaretable:workbench:collapsed';
function readCollapsed() { try { return localStorage.getItem(storageKey) === 'true'; } catch { return false; } }
const collapsed = ref(readCollapsed());
const mobile = ref(window.innerWidth < 760);
const open = ref(false);
const sidebar = ref<HTMLElement>();
let navigationTrigger: HTMLElement | null = null;
const closeButton = ref<HTMLButtonElement>();
const main = ref<HTMLElement>();
const links = [
  { name: 'Market', label: 'workbench.start', icon: House },
  { name: 'MyCharacters', label: 'workbench.collection', icon: Collection },
  { name: 'Chat', label: 'storyShell.library', icon: ChatDotRound },
  { name: 'CharacterCreate', label: 'workbench.create', icon: EditPen },
];
const active = computed(() => section.value || (({ CharacterDetail: 'Market', ChatSession: 'Chat', CharacterEdit: 'CharacterCreate' } as Record<string, string>)[String(route.name)] || route.name));
const title = computed(() => t(({
  Market: 'workbench.start', MyCharacters: 'workbench.collection', Chat: 'storyShell.library',
  ChatSession: 'workbench.conversation', CharacterDetail: 'characterDetail.storyTitle',
  CharacterCreate: 'workbench.create', CharacterEdit: 'workbench.create', Profile: 'storyShell.account', Subscription: 'credits.title',
} as Record<string, string>)[String(route.name)] || 'workbench.title'));
function closeNavigation() { if (open.value) { open.value = false; void nextTick(() => navigationTrigger?.focus()); } }
function toggleNavigation() {
  navigationTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (mobile.value) { open.value = !open.value; if (open.value) void nextTick(() => closeButton.value?.focus()); }
  else { collapsed.value = !collapsed.value; try { localStorage.setItem(storageKey, String(collapsed.value)); } catch { /* Session preference still works. */ } }
}
provide(workbenchNavigation, { mobile, collapsed, open, toggle: toggleNavigation });
function trapFocus(event: KeyboardEvent) {
  if (!mobile.value || !open.value) return;
  if (event.key === 'Escape') { event.preventDefault(); closeNavigation(); return; }
  if (event.key !== 'Tab') return;
  const controls = [...(sidebar.value?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [])].filter(el => el.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
function resize() { mobile.value = window.innerWidth < 760; if (!mobile.value) closeNavigation(); }
watch(() => route.fullPath, () => { section.value = undefined; closeNavigation(); main.value?.scrollTo?.(0, 0); });
onMounted(() => window.addEventListener('resize', resize));
onBeforeUnmount(() => window.removeEventListener('resize', resize));
</script>

<template>
  <div class="exploration-layout story-shell paper-workbench" :class="{ 'workbench-collapsed': collapsed, 'navigation-open': open, 'workbench-conversation': route.name === 'ChatSession' }">
    <a class="exploration-skip" href="#workbench-content">{{ t('exploration.skipToContent') }}</a>
    <div v-if="mobile && open" class="workbench-backdrop" aria-hidden="true" @click="closeNavigation" />
    <aside id="workbench-navigation" ref="sidebar" class="workbench-sidebar" :inert="mobile && !open ? true : undefined"
      :role="mobile && open ? 'dialog' : undefined" :aria-modal="mobile && open ? true : undefined" :aria-label="t('storyShell.navigation')" @keydown="trapFocus">
      <div class="workbench-brand-row"><StoryBrand /><button v-if="mobile" ref="closeButton" class="workbench-icon" :aria-label="t('common.close')" @click="closeNavigation"><Close /></button></div>
      <RouterLink :to="{ name: 'MyCharacters' }" class="workbench-new" :aria-label="t('workbench.newStory')" :title="t('workbench.newStory')"><Plus /><span class="workbench-label">{{ t('workbench.newStory') }}</span></RouterLink>
      <nav class="workbench-navigation" :aria-label="t('storyShell.navigation')">
        <RouterLink v-for="item in links" :key="item.name" :to="{ name: item.name }" :aria-label="t(item.label)" :title="t(item.label)"
          :aria-current="active === item.name ? 'page' : undefined"><component :is="item.icon" /><span class="workbench-label">{{ t(item.label) }}</span></RouterLink>
      </nav>
      <div class="workbench-sidebar-bottom">
        <button class="workbench-theme" :aria-label="t(theme === 'dark' ? 'exploration.lightTheme' : 'exploration.darkTheme')" @click="toggleTheme"><span aria-hidden="true">{{ theme === 'dark' ? '☼' : '☾' }}</span><span class="workbench-label">{{ t('theme.toggle') }}</span></button>
        <RouterLink v-if="user.isAuthenticated" :to="{ name: 'Profile' }" class="workbench-user" :aria-label="t('storyShell.account')"><User /><span class="workbench-label">{{ user.user?.name || t('storyShell.account') }}<small>{{ t('storyShell.account') }}</small></span></RouterLink>
        <RouterLink v-else :to="{ name: 'Login', query: { redirect: route.fullPath } }" class="workbench-user" :aria-label="t('nav.login')"><User /><span class="workbench-label">{{ t('nav.login') }}</span></RouterLink>
      </div>
    </aside>
    <div class="workbench-body" :inert="mobile && open ? true : undefined">
      <header v-if="route.name !== 'ChatSession'" class="workbench-topbar">
        <div class="workbench-crumb"><WorkbenchNavigationToggle /><span>{{ t('workbench.title') }}<span class="workbench-divider" aria-hidden="true">/</span><strong>{{ title }}</strong></span></div>
        <button class="workbench-icon" :aria-label="t(theme === 'dark' ? 'exploration.lightTheme' : 'exploration.darkTheme')" @click="toggleTheme"><span aria-hidden="true">{{ theme === 'dark' ? '☼' : '☾' }}</span></button>
      </header>
      <div id="workbench-content" ref="main" class="workbench-main" :class="{ 'workbench-reading': route.name === 'ChatSession' }" tabindex="-1"><slot /></div>
    </div>
  </div>
</template>
