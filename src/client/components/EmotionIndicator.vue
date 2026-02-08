<!-- src/client/components/EmotionIndicator.vue -->
<template>
  <div class="emotion-indicator">
    <div class="emotion-indicator__header">
      <span class="emotion-indicator__title">{{ t('emotion.title') }}</span>
    </div>

    <!-- 2D Visualization -->
    <div class="emotion-indicator__chart">
      <div class="emotion-chart">
        <div class="emotion-chart__axes">
          <div class="emotion-chart__y-label">{{ t('emotion.arousal') }}</div>
          <div class="emotion-chart__x-label">{{ t('emotion.valence') }}</div>
        </div>
        <div
          class="emotion-chart__point"
          :style="pointStyle"
          :class="emotionClass"
        >
          <span class="emotion-chart__emoji">{{ emotionEmoji }}</span>
        </div>
      </div>
    </div>

    <!-- Current Emotion Label -->
    <div class="emotion-indicator__label">
      <el-tag :type="tagType" size="large">
        {{ emotionLabel }}
      </el-tag>
    </div>

    <!-- Values -->
    <div class="emotion-indicator__values">
      <div class="emotion-value">
        <span class="emotion-value__label">{{ t('emotion.valence') }}</span>
        <span class="emotion-value__number" :class="valenceClass">
          {{ formatValue(currentEmotion?.valence ?? 0) }}
        </span>
      </div>
      <div class="emotion-value">
        <span class="emotion-value__label">{{ t('emotion.arousal') }}</span>
        <span class="emotion-value__number">
          {{ formatValue(currentEmotion?.arousal ?? 0.5) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCharacterIntelligenceStore } from '../stores/characterIntelligence';
import { storeToRefs } from 'pinia';

const { t } = useI18n();

const store = useCharacterIntelligenceStore();
const { currentEmotion } = storeToRefs(store);

const EMOTION_CONFIG: Record<string, { emoji: string; tagType: 'success' | 'warning' | 'danger' | 'info' | 'primary' }> = {
  excited: { emoji: '🤩', tagType: 'warning' },
  happy: { emoji: '😊', tagType: 'success' },
  loving: { emoji: '🥰', tagType: 'success' },
  calm: { emoji: '😌', tagType: 'info' },
  curious: { emoji: '🤔', tagType: 'primary' },
  surprised: { emoji: '😮', tagType: 'warning' },
  confused: { emoji: '😕', tagType: 'info' },
  bored: { emoji: '😐', tagType: 'info' },
  sad: { emoji: '😢', tagType: 'danger' },
  fearful: { emoji: '😨', tagType: 'danger' },
  angry: { emoji: '😠', tagType: 'danger' },
  disgusted: { emoji: '🤢', tagType: 'danger' },
  neutral: { emoji: '😶', tagType: 'info' },
};

const emotionLabel = computed(() => {
  return currentEmotion.value?.label ?? 'neutral';
});

const emotionEmoji = computed(() => {
  const label = emotionLabel.value;
  return EMOTION_CONFIG[label]?.emoji ?? '😶';
});

const tagType = computed(() => {
  const label = emotionLabel.value;
  return EMOTION_CONFIG[label]?.tagType ?? 'info';
});

const pointStyle = computed(() => {
  const valence = currentEmotion.value?.valence ?? 0;
  const arousal = currentEmotion.value?.arousal ?? 0.5;

  // Convert valence (-1 to 1) to percentage (0 to 100)
  const left = ((valence + 1) / 2) * 100;
  // Convert arousal (0 to 1) to percentage (100 to 0, inverted for CSS)
  const top = (1 - arousal) * 100;

  return {
    left: `${left}%`,
    top: `${top}%`,
  };
});

const emotionClass = computed(() => {
  const label = emotionLabel.value;
  return `emotion-chart__point--${label}`;
});

const valenceClass = computed(() => {
  const valence = currentEmotion.value?.valence ?? 0;
  if (valence > 0.2) return 'positive';
  if (valence < -0.2) return 'negative';
  return 'neutral';
});

function formatValue(value: number | string | null): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num?.toFixed(2) ?? '0.00';
}
</script>

<style scoped>
.emotion-indicator {
  background: var(--surface-card);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.emotion-indicator__header {
  display: flex;
  justify-content: center;
}

.emotion-indicator__title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.emotion-indicator__chart {
  display: flex;
  justify-content: center;
}

.emotion-chart {
  position: relative;
  width: 120px;
  height: 120px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-danger) 30%, var(--surface-card)) 0%,
    color-mix(in srgb, var(--color-warning) 30%, var(--surface-card)) 25%,
    color-mix(in srgb, var(--color-success) 30%, var(--surface-card)) 50%,
    color-mix(in srgb, var(--color-info) 30%, var(--surface-card)) 75%,
    color-mix(in srgb, var(--accent-pink) 30%, var(--surface-card)) 100%
  );
  border-radius: 8px;
  border: 1px solid var(--border-default);
}

.emotion-chart__axes {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.emotion-chart__y-label {
  position: absolute;
  left: -24px;
  top: 50%;
  transform: rotate(-90deg) translateX(50%);
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.emotion-chart__x-label {
  position: absolute;
  bottom: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--text-secondary);
}

.emotion-chart__point {
  position: absolute;
  width: 32px;
  height: 32px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-card);
  border-radius: 50%;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--text-primary) 20%, transparent);
  transition: all 0.3s ease;
}

.emotion-chart__emoji {
  font-size: 20px;
}

.emotion-indicator__label {
  display: flex;
  justify-content: center;
}

.emotion-indicator__values {
  display: flex;
  justify-content: space-around;
}

.emotion-value {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.emotion-value__label {
  font-size: 11px;
  color: var(--text-secondary);
}

.emotion-value__number {
  font-size: 14px;
  font-weight: 600;
  font-family: monospace;
}

.emotion-value__number.positive {
  color: var(--color-success);
}

.emotion-value__number.negative {
  color: var(--color-danger);
}

.emotion-value__number.neutral {
  color: var(--text-primary);
}
</style>
