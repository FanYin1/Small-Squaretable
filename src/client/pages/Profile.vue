<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { type FormInstance, type FormRules } from 'element-plus';
import ExplorationLayout from '@client/components/layout/ExplorationLayout.vue';
import AccountActivity from '@client/components/subscription/AccountActivity.vue';
import { Moon, Sunny, SwitchButton } from '@element-plus/icons-vue';
import { useUserStore } from '@client/stores/user';
import { useModulesStore } from '@client/stores/modules';
import { userApi } from '@client/services/user.api';
import { useToast } from '@client/composables/useToast';
import { useChatFontSize } from '@client/composables/useChatFontSize';
import { useTheme } from '@client/composables/useTheme';
import { useLocale } from '@client/composables/useLocale';

const { t } = useI18n();
const router = useRouter();
const userStore = useUserStore();
const modules = useModulesStore();
const toast = useToast();
const { size: readingSize, sizes: readingSizes, setSize: setReadingSize } = useChatFontSize();
const { theme, setTheme } = useTheme();
const { currentLocale, toggleLocale } = useLocale();

const formRef = ref<FormInstance>();
const form = reactive({
  displayName: '',
  bio: '',
  avatarUrl: '',
});
const saving = ref(false);
const savedNeedsRefresh = ref(false);

async function logout() {
  await userStore.logout();
  await router.push({ name: 'Login' });
}

const rules: FormRules = {
  displayName: [
    { required: true, message: () => t('profile.nameRequired'), trigger: 'blur' },
    { min: 2, max: 50, message: () => t('profile.nameLength'), trigger: 'blur' },
  ],
  bio: [
    { max: 500, message: () => t('profile.bioLength'), trigger: 'blur' },
  ],
};

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

onMounted(() => {
  if (userStore.user) {
    form.displayName = userStore.user.name || '';
    form.bio = userStore.user.bio || '';
    form.avatarUrl = userStore.user.avatar || '';
  }
});

function handleAvatarUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_TYPES.join(',');
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(t('profile.invalidImageType'));
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.avatarTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      form.avatarUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function handleSave() {
  if (saving.value) return;
  saving.value = true;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) { saving.value = false; return; }
  savedNeedsRefresh.value = false;
  try {
    await userApi.updateProfile({
      displayName: form.displayName || undefined,
      bio: form.bio,
      avatarUrl: form.avatarUrl,
    });
    try { await userStore.fetchProfile(); }
    catch { savedNeedsRefresh.value = true; return; }
    toast.success(t('profile.updateSuccess'));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : t('common.retry');
    toast.error(msg);
  } finally {
    saving.value = false;
  }
}

async function refreshSavedProfile() {
  try { await userStore.fetchProfile(); savedNeedsRefresh.value = false; }
  catch { toast.error(t('common.retry')); }
}
</script>

<template>
  <ExplorationLayout>

    <header class="story-page-intro"><h1>{{ t('storyShell.accountHeading') }}</h1></header>
    <AccountActivity />
    <div class="account-settings-grid">
    <section class="profile-preferences" :aria-label="t('storyShell.readingPreferences')">
      <h2>{{ t('storyShell.readingPreferences') }}</h2>
      <div class="reading-font-controls" role="group" :aria-label="t('storyShell.fontSize')"><button v-for="(font, index) in readingSizes" :key="font" type="button" :aria-pressed="readingSize === font" @click="setReadingSize(font)">{{ [15, 17, 19][index] }}px</button></div>
      <div class="preference-actions" role="group" :aria-label="t('theme.toggle')"><button type="button" :aria-pressed="theme === 'light'" @click="setTheme('light')"><Sunny aria-hidden="true" />{{ t('accountActivity.light') }}</button><button type="button" :aria-pressed="theme === 'dark'" @click="setTheme('dark')"><Moon aria-hidden="true" />{{ t('accountActivity.dark') }}</button><button type="button" @click="toggleLocale">{{ currentLocale === 'zh-CN' ? 'English' : '中文' }}</button></div>
      <div class="reading-preview" :aria-label="t('accountActivity.readingPreview')"><span>{{ t('accountActivity.readingPreview') }}</span><p>{{ t('accountActivity.previewNarrative') }}</p><p>{{ t('accountActivity.previewDialogue') }}</p></div>
    </section>
    <section class="account-tools" :aria-label="t('storyShell.accountTools')">
      <h2>{{ t('accountActivity.accountSettings') }}</h2>
    <nav class="story-shortcuts" :aria-label="t('storyShell.accountTools')">
      <RouterLink :to="{ name: 'Subscription' }">{{ t('storyShell.credits') }}</RouterLink>
      <RouterLink :to="{ name: 'UserPersonas' }">{{ t('storyShell.identities') }}</RouterLink>
      <RouterLink :to="{ name: 'SecuritySettings' }">{{ t('nav.security') }}</RouterLink>
      <RouterLink :to="{ name: 'AccountSettings' }">{{ t('nav.account') }}</RouterLink>
      <RouterLink v-if="modules.isEnabled('plugins')" :to="{ name: 'PluginMarketplace' }">{{ t('nav.plugins') }}</RouterLink>
      <RouterLink v-if="modules.isEnabled('webhooks_developer')" :to="{ name: 'DeveloperSettings' }">{{ t('nav.developer') }}</RouterLink>
      <RouterLink v-if="modules.isEnabled('analytics')" :to="{ name: 'Analytics' }">{{ t('nav.analytics') }}</RouterLink>
      <RouterLink v-if="['admin', 'moderator'].includes(userStore.user?.role || '')" :to="{ name: userStore.user?.role === 'admin' ? 'AdminUsers' : 'AdminContent' }">{{ t('nav.admin') }}</RouterLink>
      <RouterLink :to="{ name: 'About' }">{{ t('storyShell.about') }}</RouterLink>
      <button type="button" class="logout-button" @click="logout"><SwitchButton aria-hidden="true" />{{ t('nav.logout') }}</button>
    </nav>
    </section>
    </div>

    <div class="profile-edit-page">
      <h2>{{ t('profile.title') }}</h2>
      <p v-if="savedNeedsRefresh" role="status">{{ t('profile.savedNeedsRefresh') }} <el-button @click="refreshSavedProfile">{{ t('credits.refresh') }}</el-button></p>
      <el-form ref="formRef" :model="form" :rules="rules" :disabled="saving" label-position="top" class="profile-form">
        <!-- Avatar -->
        <el-form-item :label="t('profile.avatar')">
          <div class="avatar-upload-area">
            <div class="avatar-preview">
              <img
                :src="form.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${form.displayName || 'default'}`"
                :alt="form.displayName"
                class="avatar-image"
              />
            </div>
            <el-button @click="handleAvatarUpload">{{ t('profile.uploadAvatar') }}</el-button>
          </div>
        </el-form-item>

        <!-- Display Name -->
        <el-form-item :label="t('profile.displayName')" prop="displayName">
          <el-input v-model="form.displayName" :maxlength="50" show-word-limit />
        </el-form-item>

        <!-- Bio -->
        <el-form-item :label="t('profile.bio')" prop="bio">
          <el-input
            v-model="form.bio"
            type="textarea"
            :rows="4"
            :maxlength="500"
            show-word-limit
            :placeholder="t('profile.bioPlaceholder')"
          />
        </el-form-item>

        <!-- Actions -->
        <div class="form-actions">
          <router-link v-if="userStore.user" :to="{ name: 'UserProfile', params: { userId: userStore.user.id } }">
            <el-button>{{ t('profile.viewPublicProfile') }}</el-button>
          </router-link>
          <el-button type="primary" :loading="saving" @click="handleSave">
            {{ t('common.save', 'Save') }}
          </el-button>
        </div>
      </el-form>
    </div>
  </ExplorationLayout>
</template>

<style scoped lang="scss">
.account-settings-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 48px; padding-block: 32px; border-bottom: 1px solid var(--border-default); }
.profile-preferences, .account-tools { min-width: 0; }
h2 { font-size: 22px; font-weight: 500; margin: 0 0 20px; }
.preference-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
.preference-actions button, .logout-button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--border-interactive); border-radius: 6px; background: transparent; color: var(--text-primary); font: inherit; cursor: pointer; }
.preference-actions button[aria-pressed='true'] { border-color: var(--accent); color: var(--accent-text); background: var(--accent-wash); }
.preference-actions svg, .logout-button svg { width: 18px; height: 18px; }
.reading-preview { margin-top: 24px; padding: 20px; border-left: 2px solid var(--accent); background: var(--bg-subtle); }
.reading-preview > span { font-size: 12px; color: var(--text-secondary); }
.reading-preview p { font-family: var(--font-body); font-size: var(--chat-font-size, 17px); line-height: 1.9; margin: 14px 0 0; overflow-wrap: anywhere; }
.account-tools .story-shortcuts { margin: 0; gap: 8px; }
.account-tools .story-shortcuts a { border-radius: 6px; }
.profile-edit-page {
  max-width: 680px;
  padding: 32px 0 0;
}

.profile-form {
  padding: 0;
}

.avatar-upload-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--border-default);
  flex-shrink: 0;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-default);
}

@include below(md) {
  .account-settings-grid { grid-template-columns: minmax(0, 1fr); gap: 32px; }
  .profile-edit-page {
    padding-top: 32px;
  }
  .profile-form {
    padding: 0;
  }
  .avatar-upload-area {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
