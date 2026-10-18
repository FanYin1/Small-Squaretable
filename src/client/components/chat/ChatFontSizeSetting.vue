<template>
  <div class="chat-font-size-setting">
    <div
      class="size-options"
      role="radiogroup"
      :aria-label="t('accountSettings.readingSizeLabel')"
    >
      <button
        v-for="(option, index) in options"
        :key="option.value"
        :ref="(el) => setOptionRef(el, index)"
        type="button"
        role="radio"
        class="size-option"
        :class="{ 'size-option--active': size === option.value }"
        :aria-checked="size === option.value"
        :tabindex="size === option.value ? 0 : -1"
        :data-size="option.value"
        @click="setSize(option.value)"
        @keydown="onKeydown($event, index)"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 预览走真实的 MarkdownRenderer，所见即聊天里所得（含 *动作* 的样式） -->
    <div class="size-preview" aria-live="polite">
      <MarkdownRenderer :content="previewContent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatFontSize, CHAT_FONT_SIZES, type ChatFontSize } from '@client/composables/useChatFontSize';
import MarkdownRenderer from './MarkdownRenderer.vue';

const { t } = useI18n();
const { size, setSize } = useChatFontSize();

const options = computed(() =>
  CHAT_FONT_SIZES.map((value) => ({
    value,
    label: t(`accountSettings.readingSize${value[0].toUpperCase()}${value.slice(1)}`),
  })),
);

const previewContent = computed(
  () => `${t('accountSettings.readingPreviewDialogue')}\n\n*${t('accountSettings.readingPreviewAction')}*`,
);

// 单选组的键盘行为：方向键在选项间移动并选中，Tab 只停在当前选中项上
const optionRefs: HTMLElement[] = [];
function setOptionRef(el: unknown, index: number) {
  if (el instanceof HTMLElement) optionRefs[index] = el;
}

function onKeydown(event: KeyboardEvent, index: number) {
  const last = CHAT_FONT_SIZES.length - 1;
  let next: number;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    next = index === last ? 0 : index + 1;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    next = index === 0 ? last : index - 1;
  } else {
    return;
  }
  event.preventDefault();
  setSize(CHAT_FONT_SIZES[next] as ChatFontSize);
  nextTick(() => optionRefs[next]?.focus());
}
</script>

<style scoped>
.size-options {
  display: inline-flex;
  gap: 8px;
  margin-bottom: 16px;
}

.size-option {
  min-width: 72px;
  min-height: 44px;
  padding: 0 16px;
  font-family: var(--font-body);
  font-size: var(--font-size-body);
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border-interactive);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.size-option:hover {
  background: var(--bg-hover);
}

.size-option:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* 选中态：琥珀边 + 浅琥珀底，文字取 --text-primary 以保证对比度，不靠颜色单独表达 */
.size-option--active {
  background: var(--accent-light);
  border-color: var(--accent);
  border-width: 2px;
  font-weight: 600;
}

.size-preview {
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
}
</style>
