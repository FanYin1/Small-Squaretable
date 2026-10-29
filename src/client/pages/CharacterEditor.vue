<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue';
import { characterApi } from '@client/services/character.api';
import { ApiError } from '@client/services/api';
import { useUserStore } from '@client/stores/user';
import ExplorationLayout from '@client/components/layout/ExplorationLayout.vue';
import CreatorWorkbench from '@client/components/character/CreatorWorkbench.vue';
import CreatorPlayerPreview from '@client/components/character/CreatorPlayerPreview.vue';
import { useCreatorDraft, parseCreatorSnapshot } from '@client/composables/useCreatorDraft';
import VersionHistory from '@client/components/character/VersionHistory.vue';
import TemplateSelector from '@client/components/character/TemplateSelector.vue';
import VoiceSettings from '@client/components/character/VoiceSettings.vue';
import ExpressionEditor from '@client/components/character/ExpressionEditor.vue';
import type { CharacterCardData } from '@client/types';
import type { VoiceConfig } from '@client/composables/useTextToSpeech';
import { characterTemplateApi } from '@client/services/character-template.api';
import CollaboratorPanel from '@client/components/character/CollaboratorPanel.vue';
import { storyRulesSchema } from '../../types/story-state';
import CharacterWorldbookBindings from '@client/components/worldbook/CharacterWorldbookBindings.vue';
import PresentationSource from '@client/components/character/PresentationSource.vue';
import type { PresentationVersion } from '../../types/story-presentation';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const userStore = useUserStore();

const isEditMode = computed(() => !!route.params.id);
const characterId = computed(() => route.params.id as string | undefined);
const loading = ref(false);
const saving = ref(false);
const loadFailed = ref(false);
const saveUncertain = ref(false);
const savedFingerprint = ref<string | null>(null);
const serverVisibility = ref('');
const advanced = ref(false);
const mobileView = ref('edit');
const selectedOpening = ref(0);
const workbench = ref<InstanceType<typeof CreatorWorkbench>>();
const localDraft = useCreatorDraft();
const accountScope = computed(() => userStore.user ? JSON.stringify([userStore.user.tenantId, userStore.user.id]) : null);
const draftKey = computed(() => accountScope.value ? `squaretable:creator:v1:${accountScope.value}:${JSON.stringify([characterId.value ?? 'new', route.query.templateId ?? null])}` : null);
let loadVersion = 0;
const showVoiceSettings = ref(false);
const voiceConfig = ref<VoiceConfig>({});
const showExpressionEditor = ref(false);
const expressionConfig = ref<Record<string, string>>({});
const isOwner = ref(false);
const originalCardData = ref<Record<string, unknown>>({});
const loadedPresentation = ref<PresentationVersion>();
const presentationFingerprint = ref('');
const explorationDraft = ref('');
watch(originalCardData, card => {
  const extensions = card.extensions as Record<string, unknown> | undefined;
  const squaretable = extensions?.squaretable as Record<string, unknown> | undefined;
  explorationDraft.value = squaretable?.exploration == null ? '' : JSON.stringify(squaretable.exploration, null, 2);
}, { immediate: true });
const explorationValidation = computed(() => {
  if (!explorationDraft.value.trim()) return { rules: null, error: '' };
  try { return { rules: storyRulesSchema.parse(JSON.parse(explorationDraft.value)), error: '' }; }
  catch (error) { return { rules: null, error: error instanceof Error ? error.message : '探索规则格式有误' }; }
});
function explorationExtension() {
  const extensions = originalCardData.value.extensions as Record<string, unknown> | undefined;
  return { ...(extensions?.squaretable as Record<string, unknown> ?? {}), exploration: explorationValidation.value.rules ?? undefined };
}
const saveAsTemplateDialogVisible = ref(false);
const savingTemplate = ref(false);

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
  alternateGreetings: [] as string[],
});

const fingerprint = computed(() => JSON.stringify([form, originalCardData.value, explorationDraft.value, voiceConfig.value, expressionConfig.value]));
const currentPresentation = computed(() => !form.description.trim()
  && presentationFingerprint.value === JSON.stringify([form.name, form.firstMessage, form.alternateGreetings])
  ? loadedPresentation.value : undefined);
function editPresentationIntroduction() {
  if (currentPresentation.value) form.description = currentPresentation.value.draft.text;
}
const dirty = computed(() => savedFingerprint.value !== null && fingerprint.value !== savedFingerprint.value);
const saveStatus = computed(() => loading.value ? t('common.loading') : loadFailed.value ? t('characterEditor.loadFailed') : saving.value ? t('characterEditor.saving') : saveUncertain.value ? t('characterEditor.saveUncertain') : dirty.value || !isEditMode.value ? t('characterEditor.unsaved') : serverVisibility.value);
watch([fingerprint, saveUncertain], () => {
  if (!loading.value && !loadFailed.value && savedFingerprint.value !== null) localDraft.persist(savedFingerprint.value, fingerprint.value, saveUncertain.value);
});
watch(() => form.alternateGreetings.length, count => { selectedOpening.value = Math.min(selectedOpening.value, count); });

async function restoreLocalDraft() {
  if (loading.value || saving.value || loadFailed.value) return;
  const requestedVersion = loadVersion;
  const draft = localDraft.take();
  if (!draft) return;
  const [fields, original, rules, voice, expressions] = parseCreatorSnapshot(draft.draft);
  loading.value = true;
  Object.assign(form, fields);
  originalCardData.value = original;
  voiceConfig.value = voice as VoiceConfig;
  expressionConfig.value = expressions;
  await nextTick();
  if (requestedVersion !== loadVersion) return;
  explorationDraft.value = rules;
  saveUncertain.value = draft.uncertain;
  showVoiceSettings.value = Object.keys(voice).length > 0;
  showExpressionEditor.value = Object.keys(expressions).length > 0;
  await nextTick();
  if (requestedVersion !== loadVersion) return;
  loading.value = false;
  if (savedFingerprint.value !== null) localDraft.persist(savedFingerprint.value, fingerprint.value, saveUncertain.value);
}

async function confirmLeave() {
  if (saving.value) return false;
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(t('characterEditor.leaveWarning'), t('characterEditor.unsaved'), { type: 'warning' });
    return true;
  } catch { return false; }
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate(async to => {
  if (to.params.id === route.params.id && to.query.templateId === route.query.templateId) return true;
  return confirmLeave();
});
function preventUnload(event: BeforeUnloadEvent) {
  if (!dirty.value && !saving.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onMounted(() => window.addEventListener('beforeunload', preventUnload));
onUnmounted(() => { loadVersion += 1; window.removeEventListener('beforeunload', preventUnload); });

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
  if (loading.value || saving.value || loadFailed.value || localDraft.pending.value) return;
  const requestedVersion = loadVersion;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPTED_TYPES.join(',');
  input.onchange = async (e: Event) => {
    if (requestedVersion !== loadVersion || saving.value) return;
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
      if (requestedVersion === loadVersion && !saving.value && typeof reader.result === 'string') form.avatarUrl = reader.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function handleCancel() {
  router.push({ name: 'MyCharacters' });
}

async function handleSave() {
  if (!formRef.value || saving.value || loading.value || loadFailed.value || localDraft.pending.value || (saveUncertain.value && !isEditMode.value)) return;
  const requestedVersion = loadVersion;
  const requestedAccount = accountScope.value;
  saving.value = true;
  try {
    await formRef.value.validate();
  } catch {
    saving.value = false;
    mobileView.value = 'edit';
    if (workbench.value) workbench.value.step = 'story';
    return;
  }

  if (requestedVersion !== loadVersion || requestedAccount !== accountScope.value) return;

  if (explorationValidation.value.error) { saving.value = false; ElMessage.error('请先修正探索规则，原始内容仍保留在编辑器中。'); return; }
  const cardData: CharacterCardData = {
    ...originalCardData.value,
    personality: form.personality || undefined,
    scenario: form.scenario || undefined,
    first_mes: form.firstMessage || undefined,
    mes_example: form.exampleMessages || undefined,
    system_prompt: form.systemPrompt || undefined,
    creator_notes: form.creatorNotes || undefined,
    alternate_greetings: form.alternateGreetings.length > 0 ? form.alternateGreetings : undefined,
    extensions: {
      ...(originalCardData.value.extensions as Record<string, unknown> || {}),
      squaretable: explorationExtension(),
      voice: voiceConfig.value,
      expressions: Object.keys(expressionConfig.value).length > 0 ? expressionConfig.value : undefined,
    },
  };

  saving.value = true;
  try {
    if (isEditMode.value && characterId.value) {
      await characterApi.updateCharacter(characterId.value, {
        name: form.name,
        description: form.description,
        avatarUrl: form.avatarUrl || null,
        cardData,
        tags: form.tags,
        category: form.category,
        isNsfw: form.isNsfw,
      });
    } else {
      if (savedFingerprint.value !== null) localDraft.persist(savedFingerprint.value, fingerprint.value, true);
      await characterApi.createCharacter({
        name: form.name,
        description: form.description || undefined,
        avatarUrl: form.avatarUrl || undefined,
        cardData,
        tags: form.tags.length ? form.tags : undefined,
        category: form.category || undefined,
        isNsfw: form.isNsfw,
      });
    }
    if (requestedVersion !== loadVersion || requestedAccount !== accountScope.value) return;
    ElMessage.success(t(isEditMode.value ? 'characterEditor.updateSuccess' : 'characterEditor.createSuccess'));
    savedFingerprint.value = fingerprint.value;
    saveUncertain.value = false;
    localDraft.clear();
    saving.value = false;
    await router.push({ name: 'MyCharacters' });
  } catch (error: unknown) {
    if (requestedVersion !== loadVersion || requestedAccount !== accountScope.value) return;
    saveUncertain.value = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
    const msg = error instanceof Error ? error.message : t('common.retry');
    ElMessage.error(msg);
  } finally {
    if (requestedVersion === loadVersion && requestedAccount === accountScope.value) {
      saving.value = false;
      if (savedFingerprint.value !== null) localDraft.persist(savedFingerprint.value, fingerprint.value, saveUncertain.value);
    }
  }
}

async function fetchCharacter(requestedVersion: number) {
  if (!characterId.value) return;
  loading.value = true;
  loadFailed.value = false;
  try {
    const character = await characterApi.getCharacter(characterId.value);
    if (requestedVersion !== loadVersion) return;
    form.name = character.name || '';
    form.description = character.description || '';
    loadedPresentation.value = character.presentation;
    form.category = character.category || '';
    form.tags = character.tags || [];
    form.isNsfw = character.isNsfw || false;
    form.avatarUrl = character.avatar || '';
    const cd = character.cardData;
    if (cd) {
      // Handle V2 cards that were stored with nested .data wrapper
      const fields = cd.data && typeof cd.data === 'object' ? (cd.data as Record<string, unknown>) : cd;
      originalCardData.value = { ...fields };
      form.personality = (fields.personality as string) || '';
      form.scenario = (fields.scenario as string) || '';
      form.systemPrompt = (fields.system_prompt as string) || '';
      form.firstMessage = (fields.first_mes as string) || '';
      form.exampleMessages = (fields.mes_example as string) || '';
      form.creatorNotes = (fields.creator_notes as string) || '';
      if (fields.extensions && typeof fields.extensions === 'object') {
        const ext = fields.extensions as Record<string, unknown>;
        if (ext.voice) {
          voiceConfig.value = ext.voice as VoiceConfig;
          showVoiceSettings.value = true;
        }
        if (ext.expressions) {
          expressionConfig.value = { ...(ext.expressions as Record<string, string>) };
          showExpressionEditor.value = true;
        }
      }
      const altGreetings = fields.alternate_greetings ?? cd.alternate_greetings;
      if (altGreetings && Array.isArray(altGreetings)) {
        form.alternateGreetings = [...altGreetings];
      }
    }
    presentationFingerprint.value = JSON.stringify([form.name, form.firstMessage, form.alternateGreetings]);
    isOwner.value = character.creatorId === userStore.user?.id && !!character.creatorId;
    serverVisibility.value = t(character.isPublic ? character.moderationStatus === 'approved' ? 'characterEditor.savedPublic' : 'characterEditor.savedSubmitted' : 'characterEditor.savedPrivate');
    await nextTick();
    if (requestedVersion !== loadVersion) return;
    savedFingerprint.value = fingerprint.value;
  } catch {
    if (requestedVersion !== loadVersion) return;
    loadFailed.value = true;
    ElMessage.error(t('characterEditor.loadFailed'));
  } finally {
    if (requestedVersion === loadVersion) loading.value = false;
  }
}

async function initializeEditor() {
  const requestedVersion = ++loadVersion;
  loading.value = true;
  saving.value = false;
  selectedOpening.value = 0;
  loadedPresentation.value = undefined;
  presentationFingerprint.value = '';
  localDraft.open(null);
  savedFingerprint.value = null;
  saveUncertain.value = false;
  Object.assign(form, { name: '', description: '', category: '', tags: [], isNsfw: false, personality: '', scenario: '', systemPrompt: '', firstMessage: '', exampleMessages: '', creatorNotes: '', avatarUrl: '', alternateGreetings: [] });
  originalCardData.value = {};
  voiceConfig.value = {};
  expressionConfig.value = {};
  showVoiceSettings.value = false;
  showExpressionEditor.value = false;
  isOwner.value = false;
  loadFailed.value = false;
  if (isEditMode.value) {
    await fetchCharacter(requestedVersion);
  } else {
    const templateId = route.query.templateId as string | undefined;
    if (templateId) {
      try {
        const template = await characterTemplateApi.useTemplate(templateId);
        if (requestedVersion !== loadVersion) return;
        originalCardData.value = { ...template.cardData };
        form.name = template.cardData.name || template.name;
        form.description = template.cardData.description || template.description || '';
        form.personality = template.cardData.personality || '';
        form.scenario = template.cardData.scenario || '';
        form.systemPrompt = template.cardData.system_prompt || '';
        form.firstMessage = template.cardData.first_mes || '';
        form.exampleMessages = template.cardData.mes_example || '';
        form.creatorNotes = template.cardData.creator_notes || '';
        if (template.cardData.alternate_greetings) {
          form.alternateGreetings = [...template.cardData.alternate_greetings];
        }
        if (template.cardData.extensions?.voice) {
          voiceConfig.value = { ...(template.cardData.extensions.voice as VoiceConfig) };
          showVoiceSettings.value = true;
        }
        if (template.cardData.extensions?.expressions) {
          expressionConfig.value = { ...(template.cardData.extensions.expressions as Record<string, string>) };
          showExpressionEditor.value = true;
        }
        if (template.category) form.category = template.category;
        if (template.tags) form.tags = template.tags;
        if (template.avatarUrl) form.avatarUrl = template.avatarUrl;
      } catch {
        if (requestedVersion !== loadVersion) return;
        loadFailed.value = true;
        ElMessage.error(t('characterEditor.loadFailed'));
      }
    }
  }
  if (requestedVersion !== loadVersion) return;
  await nextTick();
  if (requestedVersion !== loadVersion) return;
  savedFingerprint.value = fingerprint.value;
  if (!loadFailed.value) localDraft.open(draftKey.value);
  loading.value = false;
}
onMounted(initializeEditor);
watch(() => [characterId.value, route.query.templateId, accountScope.value], initializeEditor);

function replaceCardFields(cardData: Record<string, unknown>) {
  originalCardData.value = { ...cardData };
  form.personality = (cardData.personality as string) || '';
  form.scenario = (cardData.scenario as string) || '';
  form.systemPrompt = (cardData.system_prompt as string) || '';
  form.firstMessage = (cardData.first_mes as string) || '';
  form.exampleMessages = (cardData.mes_example as string) || '';
  form.creatorNotes = (cardData.creator_notes as string) || '';
  form.alternateGreetings = Array.isArray(cardData.alternate_greetings) ? [...cardData.alternate_greetings as string[]] : [];
  const extensions = cardData.extensions as Record<string, unknown> | undefined;
  voiceConfig.value = { ...(extensions?.voice as VoiceConfig ?? {}) };
  expressionConfig.value = { ...(extensions?.expressions as Record<string, string> ?? {}) };
  showVoiceSettings.value = Object.keys(voiceConfig.value).length > 0;
  showExpressionEditor.value = Object.keys(expressionConfig.value).length > 0;
}

async function handleRestoreVersion(cardData: Record<string, unknown>) {
  if (saving.value || loading.value || loadFailed.value || localDraft.pending.value) return;
  const requestedVersion = loadVersion;
  try {
    await ElMessageBox.confirm(
      t('characterEditor.restoreConfirmMessage', 'This will replace the current form fields with the selected version. Continue?'),
      t('characterEditor.restoreConfirmTitle', 'Restore Version'),
      { confirmButtonText: t('common.confirm', 'Confirm'), cancelButtonText: t('common.cancel', 'Cancel'), type: 'warning' }
    );
  } catch {
    return; // user cancelled
  }
  if (requestedVersion !== loadVersion || saving.value || loading.value) return;
  replaceCardFields(cardData);
  ElMessage.success(t('characterEditor.restoreSuccess', 'Version restored'));
}
function handleTemplateSelect(cardData: CharacterCardData) {
  if (saving.value || loading.value || loadFailed.value || localDraft.pending.value) return;
  replaceCardFields(cardData);
}

async function handleSaveAsTemplate() {
  if (savingTemplate.value || saving.value || loading.value || loadFailed.value || localDraft.pending.value) return;
  if (explorationValidation.value.error) { ElMessage.error('请先修正探索规则。'); return; }
  savingTemplate.value = true;
  try {
    const cardData = {
      ...originalCardData.value,
      personality: form.personality || undefined,
      scenario: form.scenario || undefined,
      first_mes: form.firstMessage || undefined,
      mes_example: form.exampleMessages || undefined,
      system_prompt: form.systemPrompt || undefined,
      creator_notes: form.creatorNotes || undefined,
      alternate_greetings: form.alternateGreetings.length > 0 ? form.alternateGreetings : undefined,
      extensions: {
        ...(originalCardData.value.extensions as Record<string, unknown> || {}),
        squaretable: explorationExtension(),
        voice: voiceConfig.value,
        expressions: Object.keys(expressionConfig.value).length > 0 ? expressionConfig.value : undefined,
      },
    };
    await characterTemplateApi.createTemplate({
      name: form.name,
      description: form.description || undefined,
      cardData,
      category: form.category || undefined,
      tags: form.tags.length ? form.tags : undefined,
      avatarUrl: form.avatarUrl || undefined,
    });
    ElMessage.success(t('characterEditor.templateSaved'));
    saveAsTemplateDialogVisible.value = false;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : t('common.retry');
    ElMessage.error(msg);
  } finally {
    savingTemplate.value = false;
  }
}
</script>

<template>
  <ExplorationLayout>
    <p class="creator-eyebrow">STORY STUDIO · 创作工作台</p>
    <h1 class="story-editor-title">
      {{ isEditMode ? t('characterEditor.editTitle') : t('characterEditor.createTitle') }}
    </h1>
    <p class="editor-save-status" role="status" data-testid="editor-save-status">{{ saveStatus }}</p>
    <el-button v-if="loadFailed" @click="initializeEditor">{{ t('common.retry') }}</el-button>

    <section v-if="localDraft.pending.value" class="draft-recovery" aria-label="恢复创作草稿" data-testid="creator-recovery">
      <strong>这个标签页中有尚未提交的草稿</strong>
      <p>{{ localDraft.pending.value.base === savedFingerprint ? '可以恢复编辑，服务器上的作品尚未被这份草稿替换。' : '服务器内容已变化。恢复会载入旧草稿，保存前请核对，避免覆盖较新的修改。' }}</p>
      <p v-if="localDraft.pending.value.uncertain">上次保存结果不明，请先到库中检查是否已创建作品。</p>
      <button type="button" @click="restoreLocalDraft">恢复草稿</button>
      <button type="button" @click="localDraft.clear">丢弃本地草稿</button>
    </section>
    <p v-else-if="localDraft.failed.value" role="alert" class="draft-note">无法可靠保存标签页草稿（空间不足或存储被禁用）。当前编辑仍在内存中，请勿刷新；这不代表已保存到服务器。</p>
    <p v-else-if="localDraft.stored.value" role="status" class="draft-note">草稿仅保留在当前标签页，刷新可恢复；尚未提交到服务器。</p>
    <div class="creator-toolbar">
      <div><button type="button" :aria-pressed="!advanced" @click="advanced = false">引导创作</button><button type="button" :aria-pressed="advanced" @click="advanced = true">高级编辑</button></div>
      <div class="mobile-preview-toggle"><button type="button" :aria-pressed="mobileView === 'edit'" @click="mobileView = 'edit'">编辑作品</button><button type="button" :aria-pressed="mobileView === 'preview'" @click="mobileView = 'preview'">玩家预览</button></div>
    </div>

    <div v-loading="loading" class="editor-container" :data-mobile-view="mobileView">
      <div class="workbench-columns">
        <div class="workbench-edit">
          <section v-if="currentPresentation" class="presentation-introduction" data-testid="editor-presentation">
            <h2>故事入口介绍</h2>
            <p>{{ currentPresentation.draft.text }}</p>
            <PresentationSource :presentation="currentPresentation" />
            <el-button :disabled="loading || saving || !!localDraft.pending.value" @click="editPresentationIntroduction">用这段摘录编辑介绍</el-button>
          </section>
          <CreatorWorkbench v-show="!advanced" ref="workbench" :model-value="form" v-model:selected-opening="selectedOpening" :original="originalCardData" :rules="explorationDraft" :edit-mode="isEditMode" :disabled="loading || loadFailed || saving || !!localDraft.pending.value" @update:model-value="Object.assign(form, $event)" @upload="handleAvatarUpload" @advanced="advanced = true" @library="handleCancel">
            <template #bindings><CharacterWorldbookBindings v-if="!advanced && isEditMode && characterId && isOwner && !localDraft.pending.value && !saving" :key="characterId" :character-id="characterId" /></template>
          </CreatorWorkbench>
          <div v-show="advanced">
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
        :disabled="loading || loadFailed || saving || !!localDraft.pending.value"
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

        <!-- 开关本身没问题，但后果必须说出来：标记后发布会被直接拒绝 -->
        <el-form-item :label="t('characterEditor.nsfw')">
          <el-switch v-model="form.isNsfw" />
          <span class="field-hint">{{ t('characterEditor.nsfwHint') }}</span>
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

        <!-- Alternate Greetings -->
        <el-form-item :label="t('characterEditor.alternateGreetings')">
          <div class="alternate-greetings-list">
            <div v-for="(_, index) in form.alternateGreetings" :key="index" class="greeting-item" style="display: flex; gap: 8px; margin-bottom: 8px; width: 100%;">
              <el-input
                v-model="form.alternateGreetings[index]"
                type="textarea"
                :rows="3"
                :placeholder="t('characterEditor.alternateGreetingPlaceholder', { n: index + 1 })"
                style="flex: 1;"
              />
              <el-button type="danger" text @click="form.alternateGreetings.splice(index, 1)">
                {{ t('common.delete') }}
              </el-button>
            </div>
            <el-button @click="form.alternateGreetings.push('')" :disabled="form.alternateGreetings.length >= 10">
              {{ t('characterEditor.addGreeting') }}
            </el-button>
          </div>
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

        <!-- Expression Sprites -->
        <el-divider content-position="left">
          <span class="voice-toggle" @click="showExpressionEditor = !showExpressionEditor">
            {{ t('expressionEditor.title') }}
            <el-icon style="margin-left: 4px;">
              <arrow-up v-if="showExpressionEditor" />
              <arrow-down v-else />
            </el-icon>
          </span>
        </el-divider>

        <ExpressionEditor
          v-if="showExpressionEditor"
          v-model="expressionConfig"
        />

        <details class="exploration-rule-editor">
          <summary>探索行动与状态（可选）</summary>
          <p>为卡片定义状态字段、明确行动和地图。留空将使用自由叙事模式；不会猜测数值，也不会执行外部脚本。</p>
          <label for="exploration-rules">探索规则 JSON · version 1</label>
          <textarea id="exploration-rules" v-model="explorationDraft" rows="12" maxlength="60000" spellcheck="false" placeholder='{"version":1,"fields":[],"actions":[]}' />
          <p v-if="explorationValidation.error" class="rule-error" role="alert">{{ explorationValidation.error }}</p>
          <p v-else-if="explorationDraft.trim()" role="status">格式有效。保存后只影响新故事；请先用新存档测试行动结果。</p>
          <p>作者脚本和其他未知扩展会随原卡保留。它们不等于已支持的探索规则。</p>
        </details>

        <!-- Avatar -->
        <el-divider content-position="left">{{ t('characterEditor.avatarSection') }}</el-divider>

        <el-form-item :label="t('characterEditor.avatar')">
          <div class="avatar-upload-area">
            <div class="avatar-preview">
              <img v-if="form.avatarUrl"
                :src="form.avatarUrl"
                :alt="form.name || t('characterEditor.avatarAlt')"
                class="avatar-image"
              />
              <span v-else class="avatar-placeholder">{{ form.name.slice(0, 1) || '序' }}</span>
            </div>
            <el-button @click="handleAvatarUpload">{{ t('characterEditor.uploadAvatar') }}</el-button>
            <span class="avatar-hint">{{ t('characterEditor.avatarHint') }}</span>
          </div>
        </el-form-item>

      </el-form>

          <CharacterWorldbookBindings v-if="advanced && isEditMode && characterId && isOwner && !saving && !localDraft.pending.value" :key="characterId" :character-id="characterId" />

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
          </div>
          <div class="form-actions">
            <el-button v-if="isEditMode && isOwner" :disabled="loading || loadFailed || saving || !!localDraft.pending.value" @click="saveAsTemplateDialogVisible = true">{{ t('characterEditor.saveAsTemplate') }}</el-button>
            <el-button :disabled="saving" @click="handleCancel">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" :loading="saving" :disabled="loading || loadFailed || saving || !!localDraft.pending.value || (saveUncertain && !isEditMode)" @click="handleSave">{{ isEditMode ? t('characterEditor.save') : '保存私有作品' }}</el-button>
          </div>
        </div>

        <div class="preview-col"><CreatorPlayerPreview :form="form" :selected-opening="selectedOpening" :presentation="currentPresentation" /></div>
      </div>
    </div>

    <el-dialog v-model="saveAsTemplateDialogVisible" :title="t('characterEditor.saveAsTemplate')" width="400px">
      <p>{{ t('characterEditor.saveAsTemplateConfirm') }}</p>
      <template #footer>
        <el-button @click="saveAsTemplateDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="savingTemplate" @click="handleSaveAsTemplate">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </ExplorationLayout>
</template>

<style scoped lang="scss">
.presentation-introduction { padding:20px; margin-bottom:20px; border:1px solid var(--border-default); background:var(--bg-surface); border-radius:8px; overflow-wrap:anywhere; }
.presentation-introduction h2 { font-family:var(--font-display); font-size:20px; font-weight:500; margin:0 0 12px; }
.presentation-introduction > p { font-family:var(--font-reading); line-height:1.9; white-space:pre-wrap; }
.exploration-rule-editor { margin: 24px 0; padding: 18px; border: 1px solid var(--border-default); border-radius: 8px; }
.exploration-rule-editor summary { cursor: pointer; min-height: 32px; }
.exploration-rule-editor p { font-size: 13px; line-height: 1.8; color: var(--text-secondary); }
.exploration-rule-editor label { display: block; margin: 16px 0 8px; font-size: 13px; }
.exploration-rule-editor textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 12px; background: var(--bg-subtle); color: var(--text-primary); border: 1px solid var(--border-interactive); border-radius: 6px; font-family: monospace; }
.exploration-rule-editor .rule-error { color: var(--el-color-danger); white-space: pre-wrap; overflow-wrap: anywhere; }
.editor-container {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 0;
}

.editor-form {
  padding: 0 16px;
}

.field-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
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

.creator-eyebrow { font-size:12px; letter-spacing:.12em; color:var(--accent-text); }
.workbench-columns { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:36px; align-items:start; }
.workbench-edit { min-width:0; }
.preview-col { border-left:1px solid var(--border-default); padding-left:24px; min-width:0; }
.creator-toolbar { display:flex; justify-content:space-between; gap:12px; padding:16px 0; border-bottom:1px solid var(--border-default); }
.creator-toolbar > div { display:flex; gap:8px; }
.creator-toolbar button,.draft-recovery button { color:var(--text-secondary); background:transparent; border:1px solid var(--border-default); border-radius:6px; padding:10px 14px; min-height:44px; cursor:pointer; font:inherit; font-size:13px; }
.creator-toolbar button[aria-pressed=true] { background:var(--bg-subtle); color:var(--text-primary); border-color:var(--accent-text); }
.creator-toolbar .mobile-preview-toggle { display:none; }
.draft-recovery { padding:16px 0; border-block:1px solid var(--accent-text); font-size:14px; line-height:1.8; }
.draft-recovery button { margin-right:8px; }
.draft-note { color:var(--text-secondary); font-size:13px; line-height:1.8; }
.avatar-placeholder { display:grid; place-items:center; height:100%; font-family:var(--font-display); font-size:32px; }
.creator-toolbar button:focus-visible,.draft-recovery button:focus-visible { outline:2px solid var(--accent-text); outline-offset:3px; }
@media(max-width:1000px) {
  .workbench-columns { grid-template-columns:minmax(0,1fr); }
  .creator-toolbar { flex-wrap:wrap; }
  .creator-toolbar .mobile-preview-toggle { display:flex; }
  .editor-container[data-mobile-view=edit] .preview-col,.editor-container[data-mobile-view=preview] .workbench-edit { display:none; }
  .preview-col { border:0; padding:0; }
}

@include below(md) {
  .editor-container {
    padding: 16px 0;
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
    margin: 0;
    width: 100%;
  }

  .preview-col {
    margin-top: 24px;
  }
}
</style>
