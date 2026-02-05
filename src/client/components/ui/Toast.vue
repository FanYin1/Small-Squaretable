<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import {
  CircleCheck,
  CircleClose,
  CircleCloseFilled,
  InfoFilled,
} from '@element-plus/icons-vue';

interface Props {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  closable?: boolean;
  action?: {
    text: string;
    onClick: () => void;
  };
}

interface Emits {
  (e: 'close', id: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 3000,
  closable: true,
});

const emit = defineEmits<Emits>();

const isVisible = ref(false);
let timeoutId: ReturnType<typeof setTimeout> | null = null;

// Icon mapping
const iconMap = {
  success: CircleCheck,
  error: CircleCloseFilled,
  warning: CircleClose,
  info: InfoFilled,
};

const icon = computed(() => iconMap[props.type]);

// Color mapping
const colorMap = {
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
};

const iconColor = computed(() => colorMap[props.type]);

// Background color mapping (light version)
const bgColorMap = {
  success: 'rgba(16, 185, 129, 0.1)',
  error: 'rgba(239, 68, 68, 0.1)',
  warning: 'rgba(245, 158, 11, 0.1)',
  info: 'rgba(59, 130, 246, 0.1)',
};

const bgColor = computed(() => bgColorMap[props.type]);

const handleClose = () => {
  isVisible.value = false;
  setTimeout(() => {
    emit('close', props.id);
  }, 300); // Wait for exit animation
};

const handleAction = () => {
  if (props.action) {
    props.action.onClick();
  }
  handleClose();
};

onMounted(() => {
  // Trigger enter animation
  requestAnimationFrame(() => {
    isVisible.value = true;
  });

  // Auto close after duration
  if (props.duration > 0) {
    timeoutId = setTimeout(() => {
      handleClose();
    }, props.duration);
  }
});

onUnmounted(() => {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
});
</script>

<template>
  <Transition name="slide">
    <div
      v-if="isVisible"
      :class="['toast', `toast-${type}`]"
    >
      <div class="toast-icon-wrapper" :style="{ backgroundColor: bgColor }">
        <el-icon :size="20" :color="iconColor">
          <component :is="icon" />
        </el-icon>
      </div>

      <div class="toast-content">
        <div class="toast-title">{{ title }}</div>
        <div v-if="message" class="toast-message">{{ message }}</div>
      </div>

      <div class="toast-actions">
        <button
          v-if="action"
          class="toast-action-btn"
          @click="handleAction"
        >
          {{ action.text }}
        </button>

        <button
          v-if="closable"
          class="toast-close-btn"
          @click="handleClose"
        >
          <el-icon :size="16">
            <CircleClose />
          </el-icon>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  width: 360px;
  min-height: 48px;
  padding: 16px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  border: 1px solid #E5E7EB;
}

.toast-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
  margin-bottom: 2px;
}

.toast-message {
  font-size: 13px;
  color: #6B7280;
  line-height: 1.4;
  margin-top: 4px;
}

.toast-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.toast-action-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #3B82F6;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.toast-action-btn:hover {
  background: rgba(59, 130, 246, 0.1);
}

.toast-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #9CA3AF;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toast-close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #4B5563;
}

/* Slide animations */
.slide-enter-active {
  animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-leave-active {
  animation: slideOutRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(400px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOutRight {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(400px);
  }
}

/* Mobile responsive */
@media (max-width: 767px) {
  .toast {
    width: calc(100% - 32px);
    max-width: 360px;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .toast {
    background: #1F2937;
    border-color: #374151;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .toast-title {
    color: #F9FAFB;
  }

  .toast-message {
    color: #D1D5DB;
  }

  .toast-close-btn {
    color: #6B7280;
  }

  .toast-close-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #9CA3AF;
  }
}

/* Toast type specific styles */
.toast-success .toast-title {
  color: #065F46;
}

.toast-error .toast-title {
  color: #991B1B;
}

.toast-warning .toast-title {
  color: #92400E;
}

.toast-info .toast-title {
  color: #1E40AF;
}

@media (prefers-color-scheme: dark) {
  .toast-success .toast-title {
    color: #6EE7B7;
  }

  .toast-error .toast-title {
    color: #FCA5A5;
  }

  .toast-warning .toast-title {
    color: #FCD34D;
  }

  .toast-info .toast-title {
    color: #93C5FD;
  }
}
</style>
