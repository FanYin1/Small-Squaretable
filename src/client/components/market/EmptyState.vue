<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

export type EmptyStateType = 'no-results' | 'no-data' | 'error' | 'permission-denied';

interface Props {
  type?: EmptyStateType;
  title?: string;
  description?: string;
}

interface Emits {
  (e: 'action-primary'): void;
  (e: 'action-secondary'): void;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'no-results',
  title: '',
  description: '',
});

const emit = defineEmits<Emits>();
const { t } = useI18n();

// Configuration for each empty state variant
const config = computed(() => {
  const configs = {
    'no-results': {
      title: t('market.empty.noResults'),
      description: t('market.empty.noResultsDesc'),
      primaryButton: t('market.empty.clearFilters'),
      secondaryButton: t('market.empty.browseAll'),
      primaryButtonVariant: 'primary' as const,
      secondaryButtonVariant: 'primary' as const,
    },
    'no-data': {
      title: t('market.empty.noData'),
      description: t('market.empty.noDataDesc'),
      primaryButton: t('market.empty.createNow'),
      secondaryButton: '',
      primaryButtonVariant: 'primary' as const,
      secondaryButtonVariant: 'default' as const,
    },
    'error': {
      title: t('market.empty.error'),
      description: t('market.empty.errorDesc'),
      primaryButton: t('market.empty.retry'),
      secondaryButton: t('market.empty.backHome'),
      primaryButtonVariant: 'primary' as const,
      secondaryButtonVariant: 'default' as const,
    },
    'permission-denied': {
      title: t('market.empty.permissionDenied'),
      description: t('market.empty.permissionDeniedDesc'),
      primaryButton: t('market.empty.login'),
      secondaryButton: t('market.empty.backHome'),
      primaryButtonVariant: 'primary' as const,
      secondaryButtonVariant: 'default' as const,
    },
  };

  return configs[props.type];
});

// Use custom values if provided, otherwise use default from config
const displayTitle = computed(() => props.title || config.value.title);
const displayDescription = computed(() => props.description || config.value.description);

const handleActionPrimary = () => {
  emit('action-primary');
};

const handleActionSecondary = () => {
  emit('action-secondary');
};
</script>

<template>
  <div class="empty-state" :class="{ 'error-variant': type === 'error' }">
    <div class="empty-illustration">
      <!-- no-results: Robot with speech bubble -->
      <svg v-if="type === 'no-results'" width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="30" y="30" width="60" height="50" rx="8" class="svg-fill-accent-light" stroke="var(--accent-purple)" stroke-width="2"/>
        <circle cx="45" cy="50" r="6" fill="var(--accent-purple)"/>
        <circle cx="75" cy="50" r="6" fill="var(--accent-purple)"/>
        <line x1="60" y1="30" x2="60" y2="15" stroke="var(--accent-purple)" stroke-width="2" stroke-linecap="round"/>
        <circle cx="60" cy="12" r="4" fill="var(--accent-purple)"/>
        <path d="M 45 65 Q 60 70 75 65" stroke="var(--accent-purple)" stroke-width="2" stroke-linecap="round" fill="none"/>
        <ellipse cx="95" cy="45" rx="18" ry="15" class="svg-fill-accent-subtle" stroke="var(--accent-purple)" stroke-width="2"/>
        <path d="M 85 52 L 80 58 L 88 55 Z" class="svg-fill-accent-subtle" stroke="var(--accent-purple)" stroke-width="2"/>
        <text x="95" y="50" text-anchor="middle" font-size="20" fill="var(--accent-purple)">?</text>
      </svg>

      <!-- no-data: Empty box with dust -->
      <svg v-else-if="type === 'no-data'" width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="30" y="40" width="60" height="50" rx="4" class="svg-fill-accent-light" stroke="var(--accent-purple)" stroke-width="2"/>
        <line x1="30" y1="55" x2="90" y2="55" stroke="var(--accent-purple)" stroke-width="2"/>
        <line x1="60" y1="40" x2="60" y2="90" stroke="var(--accent-purple)" stroke-width="2"/>
        <circle cx="45" cy="30" r="2" fill="var(--accent-purple)" opacity="0.4"/>
        <circle cx="75" cy="25" r="2" fill="var(--accent-purple)" opacity="0.4"/>
        <circle cx="55" cy="35" r="1.5" fill="var(--accent-purple)" opacity="0.4"/>
        <circle cx="70" cy="32" r="1" fill="var(--accent-purple)" opacity="0.3"/>
        <circle cx="50" cy="28" r="1.5" fill="var(--accent-purple)" opacity="0.25"/>
      </svg>

      <!-- error: Warning triangle -->
      <svg v-else-if="type === 'error'" width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 60 30 L 90 80 L 30 80 Z" class="svg-fill-danger-light" stroke="var(--color-danger)" stroke-width="2"/>
        <line x1="60" y1="50" x2="60" y2="65" stroke="var(--color-danger)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="60" cy="72" r="2" fill="var(--color-danger)"/>
      </svg>

      <!-- permission-denied: Lock -->
      <svg v-else-if="type === 'permission-denied'" width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="60" width="40" height="30" rx="4" class="svg-fill-accent-light" stroke="var(--accent-purple)" stroke-width="2"/>
        <path d="M 50 60 L 50 45 Q 50 35 60 35 Q 70 35 70 45 L 70 60" stroke="var(--accent-purple)" stroke-width="2" fill="none"/>
        <circle cx="60" cy="72" r="3" fill="var(--accent-purple)"/>
        <rect x="58" y="72" width="4" height="8" fill="var(--accent-purple)"/>
      </svg>
    </div>

    <h3 class="empty-title">{{ displayTitle }}</h3>
    <p class="empty-description">{{ displayDescription }}</p>

    <div class="empty-actions">
      <el-button
        v-if="config.primaryButton"
        :type="config.primaryButtonVariant"
        :plain="config.primaryButtonVariant === 'primary' && type === 'no-results'"
        @click="handleActionPrimary"
      >
        {{ config.primaryButton }}
      </el-button>
      <el-button
        v-if="config.secondaryButton"
        :type="config.secondaryButtonVariant"
        @click="handleActionSecondary"
      >
        {{ config.secondaryButton }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
  min-height: 400px;
}

.empty-illustration {
  margin-bottom: 24px;
  animation: float 3s ease-in-out infinite;
}

.empty-illustration :deep(svg) {
  display: block;
}

/* SVG fill classes using design tokens */
.svg-fill-accent-light {
  fill: color-mix(in srgb, var(--accent-purple) 15%, transparent);
}

.svg-fill-accent-subtle {
  fill: color-mix(in srgb, var(--accent-purple) 8%, transparent);
}

.svg-fill-danger-light {
  fill: color-mix(in srgb, var(--color-danger) 10%, transparent);
}

.empty-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.empty-description {
  font-size: 14px;
  color: var(--text-tertiary);
  margin: 0 0 24px 0;
  max-width: 400px;
}

.empty-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

/* Error variant specific styling */
.empty-state.error-variant .empty-title {
  color: var(--color-danger);
}

.empty-state.error-variant .empty-description {
  color: var(--color-danger);
  opacity: 0.7;
}

/* 移动端适配 */
@media (max-width: 767px) {
  .empty-state {
    padding: 60px 20px;
  }

  .empty-illustration svg {
    width: 100px;
    height: 100px;
  }

  .empty-title {
    font-size: 18px;
  }

  .empty-actions {
    flex-direction: column;
    width: 100%;
  }

  .empty-actions .el-button {
    width: 100%;
  }
}
</style>
