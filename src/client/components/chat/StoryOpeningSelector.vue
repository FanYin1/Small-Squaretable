<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { adapterReasonMessages } from '../../../types/story-adapter';
import { useI18n } from 'vue-i18n';
import { openingSelectable, type StoryEntryProfile, type OpeningSelection, type StoryOpening } from '../../../types/story-opening';
import { storyDisplayText } from '@client/utils/story-display';
import { storyCapabilityMessages } from '../../../types/story-capabilities';
import { openingRecordMessages } from '../../../types/story-opening-record';
import StoryAdaptationReport from './StoryAdaptationReport.vue';

const props = defineProps<{ profile: StoryEntryProfile | null; selection: OpeningSelection | null; loading: boolean; error: string }>();
const emit = defineEmits<{
  select: [selection: OpeningSelection]; next: [customize: boolean]; cancel: []; retry: [];
}>();
const { t } = useI18n();
const coverFailed = ref(false);
const prose = ref<HTMLElement | null>(null);
watch(() => props.profile?.avatarUrl, () => { coverFailed.value = false; });
const selected = computed(() => props.profile?.openings.find(opening => opening.reference.source === props.selection?.reference.source
  && opening.reference.index === props.selection?.reference.index));
watch(selected, async () => { await nextTick(); if (prose.value) prose.value.scrollTop = 0; });
const hasPlayable = computed(() => props.profile?.openings.some(openingSelectable));
const ready = computed(() => props.profile && props.selection && !props.loading && !props.error
  && props.profile.identity.status !== 'invalid' && props.profile.rulesStatus !== 'invalid'
  && selected.value?.record?.status !== 'conflict'
  && (selected.value ? openingSelectable(selected.value) && (selected.value.kind !== 'review' || props.selection.reviewed)
    : props.selection.reference.source === 'none' && !hasPlayable.value));
function select(opening: StoryOpening) {
  if (props.profile) emit('select', { characterId: props.profile.characterId, revision: props.profile.revision, reference: opening.reference, reviewed: false });
}
function withoutOpening() {
  if (props.profile) emit('select', { characterId: props.profile.characterId, revision: props.profile.revision, reference: { source: 'none', index: 0 }, reviewed: true });
}
function review(event: Event) {
  if (props.selection) emit('select', { ...props.selection, reviewed: (event.target as HTMLInputElement).checked });
}
function display(value: string, limit = 8000) {
  return storyDisplayText(value, { characterName: props.profile?.name, userName: t('storyEntry.you'), limit, multiline: true });
}
</script>

<template>
  <section class="opening-preparation" :aria-label="t('storyEntry.title')" :aria-busy="loading" data-testid="opening-preparation">
    <header class="preparation-header">
      <div><p class="eyebrow">{{ t('storyEntry.eyebrow') }}</p><h1>{{ t('storyEntry.title') }}</h1></div>
      <button type="button" class="quiet" @click="emit('cancel')">{{ t('common.cancel') }}</button>
    </header>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="emit('retry')">{{ t('common.retry') }}</button></div>
    <template v-else-if="profile">
      <div class="story-intro">
        <img v-if="profile.avatarUrl && !coverFailed" :src="profile.avatarUrl" alt="" @error="coverFailed = true" />
        <div><h2>{{ profile.name }}</h2><p>{{ display(profile.description.text, 160) || t('storyEntry.noIntroduction') }}</p>
          <small v-if="profile.description.source === 'opening'">{{ t('storyEntry.excerptSource') }}</small>
        </div>
      </div>
      <div v-if="profile.compatibilityIssues?.length" class="entry-support">
        <p>{{ t('storyEntry.unadapted') }}</p>
        <details><summary>{{ t('storyEntry.supportDetails') }}</summary><ul><li v-for="issue in profile.compatibilityIssues" :key="issue">{{ storyCapabilityMessages[issue] }}</li></ul></details>
      </div>
      <p v-if="profile.adaptation" class="compatibility-notice" role="status">{{ adapterReasonMessages[profile.adaptation.reason] }}</p>
      <div class="preparation-columns">
        <nav class="opening-options" :aria-label="t('storyEntry.options')">
          <button v-for="(opening, position) in profile.openings" :key="`${opening.reference.source}:${opening.reference.index}`"
            type="button" class="opening-option" :class="{ selected: selected === opening }" :aria-pressed="selected === opening"
            :data-opening="position" @click="select(opening)">
            <span class="option-heading">{{ opening.reference.source === 'first_mes' ? t('storyEntry.defaultOpening') : t('storyEntry.alternateOpening', { number: opening.reference.index + 1 }) }}</span>
            <span class="option-excerpt">{{ display(opening.preview, 90) || t('storyEntry.emptyPreview') }}</span>
            <small>{{ t(`storyEntry.kind.${opening.kind}`) }}</small>
          </button>
          <button v-if="!hasPlayable" type="button" class="opening-option" :aria-pressed="selection?.reference.source === 'none'" @click="withoutOpening">{{ t('storyEntry.withoutOpening') }}</button>
        </nav>
        <article class="opening-preview" aria-live="polite">
          <template v-if="selected?.adaptationReport">
            <p v-if="selected.adaptationReport.findings.length" class="compatibility-notice">可继续剧情 · 数值玩法尚未完整适配</p>
            <StoryAdaptationReport :report="selected.adaptationReport" />
          </template>
          <section v-if="selected?.record && selected.record.status !== 'native'" class="opening-record" aria-label="开局记录" data-testid="opening-record">
            <h3>开局记录</h3>
            <p :role="selected.record.status === 'conflict' ? 'alert' : undefined">{{ openingRecordMessages[selected.record.reason] }}</p>
            <dl v-if="selected.record.fields.length"><div v-for="field in selected.record.fields" :key="field.id"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div></dl>
            <details v-if="selected.record.fields.length"><summary>查看记录来源</summary><p v-for="field in selected.record.fields" :key="field.id">当前所选开场 · {{ field.path.join(' › ') }}</p></details>
          </section>
          <template v-if="selected">
            <p class="eyebrow">{{ t('storyEntry.preview') }}</p>
            <p ref="prose" class="opening-prose" tabindex="0" role="region" :aria-label="t('storyEntry.preview')">{{ display(selected.preview) || t('storyEntry.emptyPreview') }}</p>
            <p v-if="selected.truncated" class="notice">{{ t('storyEntry.truncated') }}</p>
            <p v-if="!openingSelectable(selected)" class="notice">{{ t('storyEntry.nonNarrative') }}</p>
            <label v-if="selected.kind === 'review'" class="review"><input type="checkbox" :checked="selection?.reviewed" @change="review" />{{ t('storyEntry.review') }}</label>
          </template>
          <p v-else>{{ selection?.reference.source === 'none' ? t('storyEntry.withoutOpeningHint') : t('storyEntry.chooseHint') }}</p>
          <details v-if="selected && openingSelectable(selected)" class="entry-facts">
            <summary>{{ t('storyEntry.startingFacts') }}</summary>
            <p v-if="profile.identity.status === 'fixed_name'">{{ t('storyEntry.fixedIdentity', { name: profile.identity.fixedName }) }}</p>
            <p v-else>{{ t('storyEntry.optionalIdentity') }}</p>
            <template v-if="profile.initialFields.length"><p>{{ t('storyEntry.cardInitials') }}</p><dl><div v-for="field in profile.initialFields" :key="field.id"><dt>{{ field.label }}</dt><dd>{{ field.value ?? t('storyEntry.unknown') }} {{ field.unit }}</dd></div></dl></template>
            <p v-else>{{ t('storyEntry.noInitials') }}</p>
          </details>
          <p v-if="profile.identity.status === 'invalid' || profile.rulesStatus === 'invalid'" role="alert">{{ t('storyEntry.invalidSetup') }}</p>
        </article>
      </div>
      <footer class="preparation-actions">
        <p>{{ t('storyEntry.noStoryYet') }}</p>
        <button type="button" :disabled="!ready" data-testid="opening-customize" @click="emit('next', true)">{{ t('exploration.customizeIdentity') }}</button>
        <button type="button" class="primary" :disabled="!ready" data-testid="opening-start" @click="emit('next', false)">{{ t('storyEntry.start') }}</button>
      </footer>
    </template>
  </section>
</template>

<style scoped lang="scss">
.opening-preparation { width: min(1120px, 100%); margin: 0 auto; padding: clamp(16px, 3vw, 40px); padding-bottom: 160px; box-sizing: border-box; color: var(--text-primary); }
.preparation-header, .preparation-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
h1, h2 { font-family: var(--font-display); font-weight: 500; margin: 8px 0 16px; overflow-wrap: anywhere; }
h1 { font-size: clamp(26px, 4vw, 38px); }
.eyebrow, small { color: var(--text-secondary); font-size: 12px; }
p { line-height: 1.8; overflow-wrap: anywhere; }
button { min-height: 44px; padding: 10px 16px; border: 1px solid var(--border-interactive); background: var(--bg-surface); color: var(--text-primary); border-radius: 10px; cursor: pointer; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 3px; }
button:disabled { cursor: not-allowed; color: var(--text-tertiary); }
.primary:enabled { background: var(--accent); color: var(--accent-on); border-color: var(--accent); }
.quiet { background: transparent; }
.story-intro { display: flex; align-items: center; gap: 24px; padding: 24px 0; }
.story-intro img { width: 88px; height: 112px; object-fit: cover; border-radius: 10px; }
.story-intro > div { min-width: 0; }
.entry-support { margin-bottom: 20px; padding: 12px 16px; border: 1px solid var(--border-default); border-radius: 10px; color: var(--text-secondary); font-size: 13px; line-height: 1.8; }
.entry-support p { margin: 0; }
.preparation-columns { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr); gap: 24px; }
.opening-options { display: flex; flex-direction: column; gap: 10px; max-height: 65dvh; overflow-y: auto; padding: 4px; }
.opening-option { flex-shrink: 0; text-align: start; display: grid; gap: 8px; border-color: var(--border-default); }
.opening-option.selected, .opening-option[aria-pressed="true"] { border-color: var(--accent-text); background: var(--bg-subtle); }
.option-heading { font-weight: 600; }
.option-excerpt { color: var(--text-secondary); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.opening-preview { min-width: 0; background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 14px; padding: clamp(16px, 3vw, 32px); }
.opening-prose { white-space: pre-wrap; font-family: var(--font-reading, inherit); line-height: 1.95; max-height: 52dvh; overflow-y: auto; overscroll-behavior: contain; padding-right: 8px; }
.opening-prose:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 3px; }
.notice, .review { display: block; padding: 12px; background: var(--bg-subtle); border-radius: 8px; line-height: 1.8; }
.review input { margin-inline-end: 8px; }
.entry-facts { margin-top: 24px; border-top: 1px solid var(--border-default); }
.opening-record { margin-bottom: 20px; padding: 16px; border: 1px solid var(--border-default); border-radius: 10px; background: var(--bg-subtle); font-size: 13px; }
.opening-record h3 { margin: 0; font-size: 15px; }
.compatibility-notice { margin: 0; color: var(--text-secondary); font-size: 13px; }
summary { cursor: pointer; padding: 14px 0; min-height: 44px; box-sizing: border-box; }
dl > div { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; }
dd { margin: 0; overflow-wrap: anywhere; }
.preparation-actions { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); width: min(1040px, calc(100% - 48px)); box-sizing: border-box; z-index: 20; padding: 12px 16px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--bg-subtle); box-shadow: 0 8px 28px #0002; }
.preparation-actions p { flex: 1 1 220px; color: var(--text-secondary); font-size: 13px; }
@include below(md) { .preparation-columns { grid-template-columns: minmax(0, 1fr); } .opening-options { max-height: 32dvh; } .story-intro img { width: 64px; height: 84px; } .preparation-actions { bottom: 0; width: 100%; border-radius: 12px 12px 0 0; padding-bottom: max(12px, env(safe-area-inset-bottom)); gap: 8px; } .preparation-actions p { margin: 0; font-size: 12px; } .preparation-actions button { flex: 1 1 140px; } }
</style>
