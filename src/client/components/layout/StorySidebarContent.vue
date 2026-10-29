<template>
  <div class="story-sidebar-content">
    <StoryBrand />
    <p class="navigation-caption">{{ t('storyShell.tagline') }}</p>
    <StoryNavigation @navigate="emit('navigate')" />
    <nav v-if="userStore.isAuthenticated && section === 'MyCharacters'" class="secondary-navigation" :aria-label="t('storyShell.authorTools')">
      <p>{{ t('storyShell.authorTools') }}</p>
      <RouterLink v-for="item in authorLinks" :key="item.name" :to="{ name: item.name }" @click="emit('navigate')">{{ t(item.label) }}</RouterLink>
    </nav>
    <nav v-if="userStore.isAuthenticated && section === 'Profile'" class="secondary-navigation" :aria-label="t('storyShell.accountTools')">
      <p>{{ t('storyShell.accountTools') }}</p>
      <RouterLink v-for="item in accountLinks" :key="item.name" :to="{ name: item.name }" @click="emit('navigate')">{{ t(item.label) }}</RouterLink>
      <RouterLink v-if="modules.isEnabled('plugins')" :to="{ name: 'PluginMarketplace' }" @click="emit('navigate')">{{ t('nav.plugins') }}</RouterLink>
      <RouterLink v-if="modules.isEnabled('webhooks_developer')" :to="{ name: 'DeveloperSettings' }" @click="emit('navigate')">{{ t('nav.developer') }}</RouterLink>
      <RouterLink v-if="modules.isEnabled('analytics')" :to="{ name: 'Analytics' }" @click="emit('navigate')">{{ t('nav.analytics') }}</RouterLink>
      <RouterLink v-if="['admin', 'moderator'].includes(userStore.user?.role || '')" :to="{ name: userStore.user?.role === 'admin' ? 'AdminUsers' : 'AdminContent' }" @click="emit('navigate')">{{ t('nav.admin') }}</RouterLink>
    </nav>
    <div class="story-sidebar-bottom">
      <p class="sidebar-quote">{{ t('storyShell.returnLine') }}</p>
      <RouterLink v-if="userStore.isAuthenticated" :to="{ name: 'Subscription' }" class="credits-link" @click="emit('navigate')">{{ t('storyShell.credits') }} ↗</RouterLink>
      <div class="appearance-controls"><button type="button" @click="toggleTheme">{{ t('theme.toggle') }}</button><button type="button" @click="toggleLocale">{{ currentLocale === 'zh-CN' ? 'English' : '中文' }}</button></div>
      <RouterLink v-if="!userStore.isAuthenticated" :to="{ name: 'Login' }" class="credits-link" @click="emit('navigate')">{{ t('nav.login') }}</RouterLink>
      <div v-else class="sidebar-user"><span>{{ userStore.user?.name || t('storyShell.account') }}</span><button type="button" @click="logout">{{ t('nav.logout') }}</button></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@client/stores/user';
import { useModulesStore } from '@client/stores/modules';
import { useTheme, useLocale } from '@client/composables';
import { storyNavigationSection } from './story-navigation';
import StoryBrand from './StoryBrand.vue';
import StoryNavigation from './StoryNavigation.vue';
const emit = defineEmits<{ navigate: [] }>();
const { t } = useI18n();
const { toggleTheme } = useTheme();
const { currentLocale, toggleLocale } = useLocale();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const modules = useModulesStore();
const section = computed(() => storyNavigationSection(route.name));
const authorLinks = [{ name: 'WorldBooks', label: 'nav.worldBooks' }, { name: 'PresetManager', label: 'storyShell.presets' }, { name: 'CharacterTemplates', label: 'storyShell.templates' }];
const accountLinks = [{ name: 'UserPersonas', label: 'storyShell.identities' }, { name: 'Subscription', label: 'storyShell.credits' }, { name: 'SecuritySettings', label: 'nav.security' }, { name: 'AccountSettings', label: 'nav.account' }];
async function logout() { await userStore.logout(); emit('navigate'); await router.push({ name: 'Login' }); }
</script>
<style scoped>
.story-sidebar-content { display:flex; flex-direction:column; min-height:100%; }
.navigation-caption { padding:0 24px; margin:0 0 18px; font-size:11px; color:var(--text-tertiary); letter-spacing:.08em; }
.secondary-navigation { margin:24px 24px 0; border-top:1px solid var(--border-default); padding-top:16px; }
.secondary-navigation p { font-size:12px; color:var(--text-tertiary); }
.secondary-navigation a { display:flex; align-items:center; min-height:44px; color:var(--text-secondary); text-decoration:none; }
.secondary-navigation a.router-link-exact-active { color:var(--accent-text); }
.story-sidebar-bottom { margin-top:auto; padding:24px; }
.sidebar-quote { font-family:var(--font-display); color:var(--text-secondary); line-height:1.8; margin:24px 0; }
.credits-link { display:block; min-height:44px; padding:12px; border:1px solid var(--border-default); border-radius:12px; color:var(--accent-text); text-decoration:none; }
.appearance-controls,.sidebar-user { display:flex; gap:8px; align-items:center; justify-content:space-between; margin-top:12px; }
button { min-height:44px; border:0; background:transparent; color:var(--text-secondary); cursor:pointer; }
.sidebar-user span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
a:focus-visible,button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
