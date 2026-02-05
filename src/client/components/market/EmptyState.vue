<script setup lang="ts">
import { computed } from 'vue';

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

// Configuration for each empty state variant
const config = computed(() => {
  const configs = {
    'no-results': {
      title: '暂无角色',
      description: '调整筛选条件或搜索其他关键词',
      primaryButton: '清除所有筛选',
      secondaryButton: '浏览全部角色',
      primaryButtonVariant: 'primary' as const,
      secondaryButtonVariant: 'primary' as const,
    },
    'no-data': {
      title: '还没有内容',
      description: '创建您的第一个角色',
      primaryButton: '立即创建',
      secondaryButton: '',
      primaryButtonVariant: 'primary' as const,
      secondaryButtonVariant: 'default' as const,
    },
    'error': {
      title: '加载失败',
      description: '无法加载内容，请稍后重试',
      primaryButton: '重试',
      secondaryButton: '返回首页',
      primaryButtonVariant: 'primary' as const,
      secondaryButtonVariant: 'default' as const,
    },
    'permission-denied': {
      title: '无权访问',
      description: '您没有权限查看此内容',
      primaryButton: '登录',
      secondaryButton: '返回首页',
      primaryButtonVariant: 'primary' as const,
      secondaryButtonVariant: 'default' as const,
    },
  };

  return configs[props.type];
});

// Use custom values if provided, otherwise use default from config
const displayTitle = computed(() => props.title || config.value.title);
const displayDescription = computed(() => props.description || config.value.description);

// Illustration SVGs for each variant
const illustrations = {
  'no-results': `
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Robot head -->
      <rect x="30" y="30" width="60" height="50" rx="8" fill="#DBEAFE" stroke="#3B82F6" stroke-width="2"/>
      <!-- Eyes -->
      <circle cx="45" cy="50" r="6" fill="#3B82F6"/>
      <circle cx="75" cy="50" r="6" fill="#3B82F6"/>
      <!-- Antenna -->
      <line x1="60" y1="30" x2="60" y2="15" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/>
      <circle cx="60" cy="12" r="4" fill="#3B82F6"/>
      <!-- Mouth -->
      <path d="M 45 65 Q 60 70 75 65" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <!-- Speech bubble -->
      <ellipse cx="95" cy="45" rx="18" ry="15" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
      <path d="M 85 52 L 80 58 L 88 55 Z" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
      <text x="95" y="50" text-anchor="middle" font-size="20" fill="#3B82F6">?</text>
    </svg>
  `,
  'no-data': `
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Box -->
      <rect x="30" y="40" width="60" height="50" rx="4" fill="#DBEAFE" stroke="#3B82F6" stroke-width="2"/>
      <line x1="30" y1="55" x2="90" y2="55" stroke="#3B82F6" stroke-width="2"/>
      <line x1="60" y1="40" x2="60" y2="90" stroke="#3B82F6" stroke-width="2"/>
      <!-- Dust particles -->
      <circle cx="45" cy="30" r="2" fill="#93C5FD" opacity="0.6"/>
      <circle cx="75" cy="25" r="2" fill="#93C5FD" opacity="0.6"/>
      <circle cx="55" cy="35" r="1.5" fill="#93C5FD" opacity="0.6"/>
      <circle cx="70" cy="32" r="1" fill="#93C5FD" opacity="0.5"/>
      <circle cx="50" cy="28" r="1.5" fill="#93C5FD" opacity="0.4"/>
    </svg>
  `,
  'error': `
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Triangle -->
      <path d="M 60 30 L 90 80 L 30 80 Z" fill="#FEE2E2" stroke="#EF4444" stroke-width="2"/>
      <!-- Exclamation mark -->
      <line x1="60" y1="50" x2="60" y2="65" stroke="#EF4444" stroke-width="3" stroke-linecap="round"/>
      <circle cx="60" cy="72" r="2" fill="#EF4444"/>
    </svg>
  `,
  'permission-denied': `
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Lock body -->
      <rect x="40" y="60" width="40" height="30" rx="4" fill="#DBEAFE" stroke="#3B82F6" stroke-width="2"/>
      <!-- Lock shackle -->
      <path d="M 50 60 L 50 45 Q 50 35 60 35 Q 70 35 70 45 L 70 60" stroke="#3B82F6" stroke-width="2" fill="none"/>
      <!-- Keyhole -->
      <circle cx="60" cy="72" r="3" fill="#3B82F6"/>
      <rect x="58" y="72" width="4" height="8" fill="#3B82F6"/>
    </svg>
  `,
};

const currentIllustration = computed(() => illustrations[props.type]);

const handleActionPrimary = () => {
  emit('action-primary');
};

const handleActionSecondary = () => {
  emit('action-secondary');
};
</script>

<template>
  <div class="empty-state">
    <div class="empty-illustration" v-html="currentIllustration"></div>

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

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.empty-title {
  font-size: 20px;
  font-weight: 700;
  color: #4B5563;
  margin: 0 0 8px 0;
}

.empty-description {
  font-size: 14px;
  color: #9CA3AF;
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
.empty-state:has(.empty-illustration svg path[fill="#FEE2E2"]) .empty-title {
  color: #EF4444;
}

.empty-state:has(.empty-illustration svg path[fill="#FEE2E2"]) .empty-description {
  color: #FCA5A5;
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
