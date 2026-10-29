<template>
  <StoryIdentitySurface
    v-model="visible"
    :title="t(inline ? 'exploration.identityHeading' : 'personas.selectPersona')"
    :inline="inline"
    :busy="busy || saving"
    @closed="restoreTriggerFocus"
  >
    <template #preview><slot name="preview" /></template>
    <div v-if="storyMode" class="story-intro">
      <p class="story-intro-title">{{ t('personas.storyEntryTitle') }}</p>
      <p class="story-intro-copy">{{ t('personas.storyEntryDescription') }}</p>
      <slot name="entry-context" />
    </div>
    <div v-if="submissionError" class="submission-error" role="alert">{{ submissionError }}</div>
    <p v-if="creationUncertain" class="form-error" role="alert">{{ t('personas.creationUncertain') }}</p>
    <p v-if="navigationOnly" role="status">{{ t('personas.storyCreatedResume') }}</p>
    <div v-else v-loading="loading" class="persona-selector">
      <form v-if="showCreateForm" class="create-persona-form" @submit.prevent="handleCreate">
        <label for="story-persona-name">{{ t('personas.name') }}</label>
        <input id="story-persona-name" v-model="newPersonaName" :disabled="busy || saving || creationBlocked" required maxlength="100" :placeholder="t('personas.namePlaceholder')" />
        <label for="story-persona-description">{{ t('personas.description') }}</label>
        <textarea id="story-persona-description" v-model="newPersonaDescription" :disabled="busy || saving || creationBlocked" maxlength="1000" :placeholder="t('personas.descriptionPlaceholder')" />
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <div class="form-actions">
          <el-button type="button" :disabled="saving || busy" @click="showCreateForm = false">{{ t('common.back') }}</el-button>
          <el-button type="primary" native-type="submit" :loading="saving" :disabled="busy || creationBlocked">{{ t('personas.createAndUse') }}</el-button>
        </div>
      </form>
      <div v-else-if="loadError" class="load-error">
        <p class="empty-message" role="alert">{{ loadError }}</p>
        <el-button size="small" :loading="loading" @click="loadPersonas">{{ t('common.retry') }}</el-button>
      </div>
      <div v-else-if="loading" role="status">{{ t('common.loading') }}</div>
      <div v-else-if="personas.length === 0" class="empty-state">
        <p class="empty-message">{{ t('personas.noPersonas') }}</p>
        <div class="empty-actions">
          <el-button type="primary" size="small" :disabled="busy || creationBlocked" @click="showCreateForm = true">{{ t('personas.createFirst') }}</el-button>
        </div>
      </div>
      <div v-else class="persona-list">
        <button type="button" class="create-persona-link" :disabled="busy || creationBlocked" @click="showCreateForm = true">{{ t('personas.useNewIdentity') }}</button>
        <button
          v-for="persona in personas"
          :key="persona.id"
          type="button"
          :aria-pressed="selectedPersonaId === persona.id"
          :disabled="busy || saving || blocked"
          :class="['persona-item', { selected: selectedPersonaId === persona.id }]"
          @click="selectedPersonaId = persona.id"
        >
          <el-avatar :size="40" :src="persona.avatarUrl || undefined">
            {{ persona.name.charAt(0) }}
          </el-avatar>
          <div class="persona-info">
            <div class="persona-name">
              {{ persona.name }}
              <el-icon v-if="persona.isDefault" class="default-icon" :size="14">
                <StarFilled />
              </el-icon>
            </div>
            <div v-if="persona.description" class="persona-desc">
              {{ persona.description }}
            </div>
          </div>
          <el-icon v-if="selectedPersonaId === persona.id" class="check-icon" :size="20">
            <Check />
          </el-icon>
        </button>
      </div>
    </div>
    <template #footer>
      <el-button :disabled="busy || saving" @click="handleCancel">{{ t('common.cancel') }}</el-button>
      <el-button v-if="navigationOnly" type="primary" :disabled="busy" @click="emit('confirm')">{{ t('common.retry') }}</el-button>
      <el-button v-if="!navigationOnly && storyMode && !showCreateForm" :disabled="busy || saving || blocked" @click="handleSkip">{{ t(inline ? 'exploration.accountIdentity' : 'personas.continueWithout') }}</el-button>
      <el-button v-if="!navigationOnly && !showCreateForm && personas.length > 0" type="primary" :disabled="!selectedPersonaId || saving || busy || blocked || !!loadError" @click="handleConfirm">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </StoryIdentitySurface>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { StarFilled, Check } from '@element-plus/icons-vue';
import { userPersonaApi, type UserPersona } from '@client/services/user-persona.api';
import { ApiError } from '@client/services/api';
import { createLogger } from '@client/utils/logger';
import StoryIdentitySurface from './StoryIdentitySurface.vue';

const logger = createLogger('PersonaSelector');

const props = defineProps<{
  modelValue: boolean;
  storyMode?: boolean;
  inline?: boolean;
  busy?: boolean;
  submissionError?: string;
  blocked?: boolean;
  navigationOnly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'confirm': [personaId?: string];
}>();

const { t } = useI18n();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    if (!props.busy && !saving.value) emit('update:modelValue', value);
  },
});
const personas = ref<UserPersona[]>([]);
const selectedPersonaId = ref<string | null>(null);
const loading = ref(false);
const saving = ref(false);
const showCreateForm = ref(false);
const newPersonaName = ref('');
const newPersonaDescription = ref('');
const formError = ref('');
const loadError = ref('');
const creationUncertain = ref(false);
const creationBlocked = computed(() => Boolean(props.blocked || creationUncertain.value));
let loadVersion = 0;
let focusReturnTarget: HTMLElement | null = null;

watch(() => props.modelValue, (val) => {
  loadVersion += 1;
  if (val) {
    const activeElement = document.activeElement;
    focusReturnTarget = activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null;
    formError.value = '';
    showCreateForm.value = false;
    newPersonaName.value = '';
    newPersonaDescription.value = '';
    if (!props.navigationOnly) loadPersonas();
  }
}, { immediate: true });

function restoreTriggerFocus() {
  if (props.modelValue) return;
  const target = focusReturnTarget;
  focusReturnTarget = null;
  if (target?.isConnected && !target.closest('[inert]') && target.getClientRects().length) {
    target.focus({ preventScroll: true });
  }
}

onUnmounted(() => {
  loadVersion += 1;
  focusReturnTarget = null;
});

async function loadPersonas() {
  const requestVersion = ++loadVersion;
  loading.value = true;
  loadError.value = '';
  selectedPersonaId.value = null;
  personas.value = [];
  try {
    const loadedPersonas = await userPersonaApi.list();
    if (requestVersion !== loadVersion) return;
    personas.value = loadedPersonas;
    // Auto-select default persona
    const defaultPersona = personas.value.find(p => p.isDefault);
    if (defaultPersona) {
      selectedPersonaId.value = defaultPersona.id;
    } else if (personas.value.length > 0) {
      selectedPersonaId.value = personas.value[0].id;
    }
  } catch (error) {
    if (requestVersion !== loadVersion) return;
    logger.error('Failed to load personas:', error);
    loadError.value = t('personas.loadFailed');
  } finally {
    if (requestVersion === loadVersion) loading.value = false;
  }
}

const handleCreate = async () => {
  const name = newPersonaName.value.trim();
  if (!name || saving.value || props.busy || creationBlocked.value) return;
  const requestVersion = loadVersion;
  saving.value = true;
  formError.value = '';
  try {
    const persona = await userPersonaApi.create({
      name,
      description: newPersonaDescription.value.trim() || undefined,
    });
    if (requestVersion !== loadVersion) return;
    personas.value = [persona, ...personas.value.filter((item) => item.id !== persona.id)];
    selectedPersonaId.value = persona.id;
    showCreateForm.value = false;
    emit('confirm', persona.id);
  } catch (error) {
    if (requestVersion !== loadVersion) return;
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 408) {
      creationUncertain.value = true;
    } else {
      formError.value = error instanceof Error ? error.message : t('personas.createFailed');
    }
  } finally {
    saving.value = false;
  }
};

const handleConfirm = () => {
  if (selectedPersonaId.value && !props.busy && !props.blocked && !saving.value && !loadError.value && !showCreateForm.value) {
    emit('confirm', selectedPersonaId.value);
  }
};

const handleCancel = () => {
  if (props.busy || saving.value) return;
  visible.value = false;
};

const handleSkip = () => {
  if (props.busy || props.blocked || saving.value) return;
  emit('confirm');
};

</script>

<style scoped>
.persona-selector {
  min-height: 200px;
}

.story-intro {
  padding: 14px 16px;
  margin-bottom: 16px;
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent-wash);
}

.story-intro-title,
.story-intro-copy {
  margin: 0;
}

.story-intro-title {
  color: var(--text-primary);
  font-weight: 600;
}

.story-intro-copy {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 0;
}

.empty-actions,
.form-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.create-persona-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.create-persona-form label {
  margin-top: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.create-persona-form input,
.create-persona-form textarea {
  width: 100%;
  padding: 10px 12px;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font: inherit;
  box-sizing: border-box;
}

.create-persona-form textarea {
  min-height: 96px;
  resize: vertical;
}

.create-persona-form input:focus-visible,
.create-persona-form textarea:focus-visible,
.persona-item:focus-visible,
.create-persona-link:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.form-error,
.submission-error {
  margin: 4px 0;
  color: var(--el-color-danger);
  font-size: 13px;
}

.submission-error {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--el-color-danger) 35%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--el-color-danger) 8%, var(--bg-surface));
}

.load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
}

.form-actions {
  margin-top: 12px;
}

.create-persona-link {
  align-self: flex-start;
  padding: 4px 0;
  color: var(--accent-text);
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
}

.create-persona-link:disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.empty-message {
  font-size: 14px;
  color: var(--text-secondary);
}

.persona-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.persona-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  width: 100%;
  background: var(--bg-surface);
  font: inherit;
  text-align: start;
  border: 2px solid var(--border-default);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.persona-item:focus-visible {
  border-color: var(--accent);
}

.persona-item:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.persona-item:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.persona-item.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface));
}

.persona-info {
  flex: 1;
  min-width: 0;
}

.persona-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.default-icon {
  color: var(--warning);
}

.persona-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.check-icon {
  color: var(--accent-text);
  flex-shrink: 0;
}

.persona-selector :deep(.el-button),
.create-persona-link {
  min-height: 44px;
}

:deep(.el-dialog__footer) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

:deep(.el-dialog__footer .el-button) {
  min-height: 44px;
  margin-left: 0;
}
</style>
