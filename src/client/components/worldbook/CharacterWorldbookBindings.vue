<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { characterWorldbookApi } from '@client/services/character-worldbook.api';
import type { CharacterWorldbookBinding, CharacterWorldbookBindings } from '../../../types/character-worldbook-bindings';

const props = defineProps<{ characterId: string }>();
const { t } = useI18n();
const state = ref<CharacterWorldbookBindings | null>(null);
const loading = ref(false);
const saving = ref(false);
const selected = ref('');
const error = ref('');
const saved = ref(false);
let revision = 0;
const bound = computed(() => state.value?.books.filter(book => book.characterId === props.characterId) ?? []);
const available = computed(() => state.value?.books.filter(book => book.characterId === null && ['global', 'character'].includes(book.scope)) ?? []);

async function load() {
  const current = ++revision;
  loading.value = true;
  error.value = '';
  state.value = null;
  selected.value = '';
  try {
    const result = await characterWorldbookApi.list(props.characterId);
    if (current === revision) state.value = result;
  } catch {
    if (current === revision) error.value = t('worldbookBindings.loadFailed');
  } finally {
    if (current === revision) loading.value = false;
  }
}

async function change(book: CharacterWorldbookBinding, action: 'bind' | 'unbind') {
  if (saving.value || loading.value) return;
  saving.value = true;
  saved.value = false;
  error.value = '';
  const characterId = props.characterId;
  try {
    await characterWorldbookApi.change(characterId, book.id, action, book.characterId);
    if (characterId !== props.characterId) return;
    await load();
    saved.value = !error.value;
  } catch {
    if (characterId === props.characterId) {
      state.value = null;
      error.value = t('worldbookBindings.saveFailed');
    }
  } finally {
    saving.value = false;
  }
}

function bindSelected() {
  const book = available.value.find(item => item.id === selected.value);
  if (book) void change(book, 'bind');
}

watch(() => props.characterId, () => { saved.value = false; void load(); }, { immediate: true });
</script>

<template>
  <section class="worldbook-bindings" aria-labelledby="worldbook-bindings-heading" :aria-busy="loading || saving">
    <h2 id="worldbook-bindings-heading">{{ t('worldbookBindings.title') }}</h2>
    <p>{{ t('worldbookBindings.description') }}</p>
    <p class="binding-hint">{{ t('worldbookBindings.persistence') }}</p>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <div v-if="error" role="alert" class="binding-error">
      <p>{{ error }}</p>
      <button type="button" :disabled="loading || saving" @click="load">{{ t('worldbookBindings.refresh') }}</button>
    </div>
    <p v-if="saved" role="status">{{ t('worldbookBindings.saved') }}</p>
    <template v-if="state">
      <ul v-if="bound.length" class="bound-books">
        <li v-for="book in bound" :key="book.id">
          <div>
            <router-link :to="{ name: 'WorldBookDetail', params: { id: book.id } }">{{ book.name }}</router-link>
            <span>{{ t('worldbookBindings.entryCount', { count: book.enabledEntryCount, total: book.entryCount }) }}</span>
            <span v-if="!book.isEnabled || book.scope !== 'character'">{{ t('worldbookBindings.inactive') }}</span>
          </div>
          <button type="button" :disabled="saving || loading" :aria-label="t('worldbookBindings.unbindNamed', { name: book.name })" @click="change(book, 'unbind')">{{ t('worldbookBindings.unbind') }}</button>
        </li>
      </ul>
      <p v-else>{{ t('worldbookBindings.noneBound') }}</p>
      <div class="binding-controls">
        <label for="worldbook-binding-select">{{ t('worldbookBindings.select') }}</label>
        <select id="worldbook-binding-select" v-model="selected" :disabled="saving || loading">
          <option value="">{{ t('worldbookBindings.choose') }}</option>
          <option v-for="book in available" :key="book.id" :value="book.id">{{ book.name }}</option>
        </select>
        <button type="button" :disabled="!selected || saving || loading" @click="bindSelected">{{ t('worldbookBindings.bind') }}</button>
      </div>
      <p v-if="selected"><router-link :to="{ name: 'WorldBookDetail', params: { id: selected } }">{{ t('worldbookBindings.reviewSelected') }}</router-link></p>
      <p class="binding-hint">{{ t('worldbookBindings.oneCharacter') }} <router-link :to="{ name: 'WorldBooks' }">{{ t('worldbookBindings.manage') }}</router-link></p>
      <h3>{{ t('worldbookBindings.dependencies') }}</h3>
      <p class="binding-hint">{{ t('worldbookBindings.diagnosticScope') }}</p>
      <ul v-if="state.dependencies.length">
        <li v-for="dependency in state.dependencies" :key="dependency.name">{{ dependency.name }} — {{ t(`worldbookBindings.dependency_${dependency.status}`) }}</li>
      </ul>
      <p v-else>{{ t('worldbookBindings.noDeclaration') }}</p>
    </template>
  </section>
</template>

<style scoped>
.worldbook-bindings { margin: 24px 0; padding: 24px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-default); border-radius: 12px; overflow-wrap: anywhere; }
h2 { margin-top: 0; font-size: 18px; }
h3 { margin-top: 24px; font-size: 15px; }
p, li { font-size: 14px; line-height: 1.7; }
a { color: var(--accent-text); }
.binding-hint, .bound-books span { color: var(--text-secondary); font-size: 13px; }
.bound-books { padding: 0; list-style: none; }
.bound-books li { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-default); }
.bound-books span { display: block; }
.binding-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.binding-controls label { width: 100%; }
select { flex: 1; min-width: 0; max-width: 100%; }
button, select { min-height: 40px; padding: 8px 12px; border: 1px solid var(--border-interactive); border-radius: 6px; background: var(--bg-subtle); color: var(--text-primary); font: inherit; }
button { cursor: pointer; flex-shrink: 0; }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.binding-error { color: var(--el-color-danger); }
@media (max-width: 480px) { .worldbook-bindings { padding: 16px; } .binding-controls select { flex-basis: 100%; } }
</style>
