<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue';
import { characterApi } from '@client/services/character.api';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import CharacterPreview from '@client/components/character/CharacterPreview.vue';
import VersionHistory from '@client/components/character/VersionHistory.vue';
import TemplateSelector from '@client/components/character/TemplateSelector.vue';
import VoiceSettings from '@client/components/character/VoiceSettings.vue';
import type { CharacterCardData } from '@client/types';
import type { VoiceConfig } from '@client/composables/useTextToSpeech';
import { characterTemplateApi } from '@client/services/character-template.api';
import CollaboratorPanel from '@client/components/character/CollaboratorPanel.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const isEditMode = computed(() => !!route.params.id);
const characterId = computed(() => route.params.id as string | undefined);
const loading = ref(false);
const saving = ref(false);
const showVoiceSettings = ref(false);
const voiceConfig = ref<VoiceConfig>({});
const isOwner = ref(false);

// Form data
const form = reactive({
  name: '',
  description: '',
  category: '',
  tags: [] as string[],
  isNsfw: false,
  personality: '',
  scenario: '',
  systemPrompt: '',
  firstMessage: '',
  exampleMessages: '',
  creatorNotes: '',
  avatarUrl: '',
});

// Form rules
const formRules = {
  name: [
    { required: true, message: () => t('characterEditor.nameRequired'), trigger: 'blur' },
    { max: 255, message: () => t('characterEditor.nameMaxLength'), trigger: 'blur' },
  ],
};

const formRef = ref();

const categoryOptions = [
  { value: 'assistant', label: () => t('characterEditor.categoryAssistant') },
  { value: 'entertainment', label: () => t('characterEditor.categoryEntertainment') },
  { value: 'education', label: () => t('characterEditor.categoryEducation') },
  { value: 'game', label: () => t('characterEditor.categoryGame') },
  { value: 'historical', label: () => t('characterEditor.categoryHistorical') },
  { value: 'modern', label: () => t('characterEditor.categoryModern') },
];

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function handleAvatarUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_TYPES.join(',');
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      ElMessage.error(t('characterEditor.avatarInvalidType'));
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      ElMessage.error(t('characterEditor.avatarTooLarge'));
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

function handleCancel() {
  router.push({ name: 'MyCharacters' });
}

async function handleSave() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }

  const cardData: CharacterCardData = {
    personality: form.personality || undefined,
    scenario: form.scenario || undefined,
    first_mes: form.firstMessage || undefined,
    mes_example: form.exampleMessages || undefined,
    system_prompt: form.systemPrompt || undefined,
    creator_notes: form.creatorNotes || undefined,
    extensions: {
      voice: voiceConfig.value,
    },
  };

  saving.value = true;
  try {
    if (isEditMode.value && characterId.value) {
      await characterApi.updateCharacter(characterId.value, {
        name: form.name,
        description: form.description || undefined,
        avatarUrl: form.avatarUrl || undefined,
        cardData,
        tags: form.tags.length ? form.tags : undefined,
        category: form.category || undefined,
        isNsfw: form.isNsfw,
      });
      ElMessage.success(t('characterEditor.updateSuccess'));
    } else {
      await characterApi.createCharacter({
        name: form.name,
        description: form.description || undefined,
        avatarUrl: form.avatarUrl || undefined,
        cardData,
        tags: form.tags.length ? form.tags : undefined,
        category: form.category || undefined,
        isNsfw: form.isNsfw,
      });
      ElMessage.success(t('characterEditor.createSuccess'));
    }
    router.push({ name: 'MyCharacters' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : t('common.retry');
    ElMessage.error(msg);
  } finally {
    saving.value = false;
  }
}

async function fetchCharacter() {
  if (!characterId.value) return;
  loading.value = true;
  try {
    const character = await characterApi.getCharacter(characterId.value);
    form.name = character.name || '';
    form.description = character.description || '';
    form.category = character.category || '';
    form.tags = character.tags || [];
    form.isNsfw = character.isNsfw || false;
    form.avatarUrl = character.avatar || '';
    const cd = character.cardData;
    if (cd) {
      form.personality = cd.personality || '';
      form.scenario = cd.scenario || '';
      form.systemPrompt = cd.system_prompt || '';
      form.firstMessage = cd.first_mes || '';
      form.exampleMessages = cd.mes_example || '';
      form.creatorNotes = cd.creator_notes || '';
      if (cd.extensions?.voice) {
        voiceConfig.value = cd.extensions.voice as VoiceConfig;
        showVoiceSettings.value = true;
      }
    }
    isOwner.value = true;
  } catch (error: unknown) {
    ElMessage.error(t('characterEditor.loadFailed'));
    router.push({ name: 'MyCharacters' });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (isEditMode.value) {
    await fetchCharacter();
  } else {
    const templateId = route.query.templateId as string | undefined;
    if (templateId) {
      try {
        const template = await characterTemplateApi.useTemplate(templateId);
        form.name = template.cardData.name || template.name;
        form.description = template.cardData.description || template.description || '';
        form.personality = template.cardData.personality || '';
        form.scenario = template.cardData.scenario || '';
        form.systemPrompt = template.cardData.system_prompt || '';
        form.firstMessage = template.cardData.first_mes || '';
        form.exampleMessages = template.cardData.mes_example || '';
        form.creatorNotes = template.cardData.creator_notes || '';
        if (template.category) form.category = template.category;
        if (template.tags) form.tags = template.tags;
        if (template.avatarUrl) form.avatarUrl = template.avatarUrl;
      } catch {
        // Template not found, continue with empty form
      }
    }
  }
});

async function handleRestoreVersion(cardData: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      t('characterEditor.restoreConfirmMessage', 'This will replace the current form fields with the selected version. Continue?'),
      t('characterEditor.restoreConfirmTitle', 'Restore Version'),
      { confirmButtonText: t('common.confirm', 'Confirm'), cancelButtonText: t('common.cancel', 'Cancel'), type: 'warning' }
    );
  } catch {
    return; // user cancelled
  }
  form.personality = (cardData.personality as string) || '';
  form.scenario = (cardData.scenario as string) || '';
  form.systemPrompt = (cardData.system_prompt as string) || '';
  form.firstMessage = (cardData.first_mes as string) || '';
  form.exampleMessages = (cardData.mes_example as string) || '';
  form.creatorNotes = (cardData.creator_notes as string) || '';
  ElMessage.success(t('characterEditor.restoreSuccess', 'Version restored'));
}
function handleTemplateSelect(cardData: CharacterCardData) {
  form.personality = cardData.personality || '';
  form.scenario = cardData.scenario || '';
  form.systemPrompt = cardData.system_prompt || '';
  form.firstMessage = cardData.first_mes || '';
  form.exampleMessages = cardData.mes_example || '';
  form.creatorNotes = cardData.creator_notes || '';
}
</script>

<template>
  <DashboardLayout>
    <template #title>
      {{ isEditMode ? t('characterEditor.editTitle') : t('characterEditor.createTitle') }}
    </template>

    <div v-loading="loading" class="editor-container">
      <el-row :gutter="24">
        <el-col :xs="24" :sm="24" :md="14" :lg="14">
          <TemplateSelector
            v-if="!isEditMode"
            @select="handleTemplateSelect"
          />
          <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-position="top"
        class="editor-form"
      >
        <!-- Basic Info -->
        <el-divider content-position="left">{{ t('characterEditor.basicInfo') }}</el-divider>

        <el-form-item :label="t('characterEditor.name')" prop="name">
          <el-input v-model="form.name" :maxlength="255" show-word-limit />
        </el-form-item>

        <el-form-item :label="t('characterEditor.description')">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>

        <el-form-item :label="t('characterEditor.category')">
          <el-select v-model="form.category" :placeholder="t('characterEditor.categoryPlaceholder')" clearable>
            <el-option
              v-for="opt in categoryOptions"
              :key="opt.value"
              :label="opt.label()"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('characterEditor.tags')">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            :placeholder="t('characterEditor.tagsPlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="t('characterEditor.nsfw')">
          <el-switch v-model="form.isNsfw" />
        </el-form-item>

        <!-- Personality -->
        <el-divider content-position="left">{{ t('characterEditor.personalitySection') }}</el-divider>

        <el-form-item :label="t('characterEditor.personality')">
          <el-input v-model="form.personality" type="textarea" :rows="5" />
        </el-form-item>

        <el-form-item :label="t('characterEditor.scenario')">
          <el-input v-model="form.scenario" type="textarea" :rows="3" />
        </el-form-item>

        <el-form-item :label="t('characterEditor.systemPrompt')">
          <el-input v-model="form.systemPrompt" type="textarea" :rows="5" />
        </el-form-item>

        <!-- Messages -->
        <el-divider content-position="left">{{ t('characterEditor.messagesSection') }}</el-divider>

        <el-form-item :label="t('characterEditor.firstMessage')">
          <el-input v-model="form.firstMessage" type="textarea" :rows="5" />
        </el-form-item>

        <el-form-item :label="t('characterEditor.exampleMessages')">
          <el-input v-model="form.exampleMessages" type="textarea" :rows="8" />
        </el-form-item>

        <!-- Creator Info -->
        <el-divider content-position="left">{{ t('characterEditor.creatorInfoSection') }}</el-divider>

        <el-form-item :label="t('characterEditor.creatorNotes')">
          <el-input v-model="form.creatorNotes" type="textarea" :rows="3" />
        </el-form-item>

        <!-- Voice Settings -->
        <el-divider content-position="left">
          <span class="voice-toggle" @click="showVoiceSettings = !showVoiceSettings">
            {{ t('characterEditor.voiceSettingsSection', 'Voice Settings') }}
            <el-icon style="margin-left: 4px;">
              <arrow-up v-if="showVoiceSettings" />
              <arrow-down v-else />
            </el-icon>
          </span>
        </el-divider>

        <VoiceSettings
          v-if="showVoiceSettings"
          v-model="voiceConfig"
        />

        <!-- Avatar -->
        <el-divider content-position="left">{{ t('characterEditor.avatarSection') }}</el-divider>

        <el-form-item :label="t('characterEditor.avatar')">
          <div class="avatar-upload-area">
            <div class="avatar-preview">
              <img
                :src="form.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${form.name || 'default'}`"
                :alt="form.name || t('characterEditor.avatarAlt')"
                class="avatar-image"
              />
            </div>
            <el-button @click="handleAvatarUpload">{{ t('characterEditor.uploadAvatar') }}</el-button>
            <span class="avatar-hint">{{ t('characterEditor.avatarHint') }}</span>
          </div>
        </el-form-item>

        <!-- Actions -->
        <div class="form-actions">
          <el-button @click="handleCancel">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">
            {{ isEditMode ? t('characterEditor.save') : t('characterEditor.create') }}
          </el-button>
        </div>
      </el-form>

          <VersionHistory
            v-if="isEditMode && characterId"
            :character-id="characterId"
            @restore="handleRestoreVersion"
          />

          <CollaboratorPanel
            v-if="isEditMode && characterId && isOwner"
            :character-id="characterId"
            :is-owner="isOwner"
          />
        </el-col>

        <el-col :xs="24" :sm="24" :md="10" :lg="10" class="preview-col">
          <CharacterPreview
            :name="form.name"
            :description="form.description"
            :avatar-url="form.avatarUrl"
            :personality="form.personality"
            :first-message="form.firstMessage"
            :tags="form.tags"
            :category="form.category"
          />
        </el-col>
      </el-row>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.editor-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.editor-form {
  background: var(--surface-card);
  border-radius: 12px;
  padding: 32px;
  border: 1px solid var(--border-default);
}

.editor-form :deep(.el-divider__text) {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.editor-form :deep(.el-select) {
  width: 100%;
}

.preview-col {
  display: block;
}

.avatar-upload-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid var(--border-default);
  flex-shrink: 0;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--border-default);
}

.voice-toggle {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  user-select: none;
}

@media (max-width: 767px) {
  .editor-container {
    padding: 16px;
  }

  .editor-form {
    padding: 16px;
  }

  .avatar-upload-area {
    flex-direction: column;
    align-items: flex-start;
  }

  .form-actions {
    flex-direction: column;
  }

  .form-actions .el-button {
    width: 100%;
  }

  .preview-col {
    margin-top: 24px;
  }
}
</style>
