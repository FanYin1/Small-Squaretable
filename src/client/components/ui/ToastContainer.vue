<script setup lang="ts">
import { ref, provide, readonly } from 'vue';
import Toast from './Toast.vue';

interface ToastItem {
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

interface ToastContext {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

// Toast state
const toasts = ref<ToastItem[]>([]);

const MAX_TOASTS = 5;

const addToast = (toast: Omit<ToastItem, 'id'>) => {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Remove oldest toast if we've reached the limit
  if (toasts.value.length >= MAX_TOASTS) {
    toasts.value.shift();
  }

  toasts.value.push({ ...toast, id } as ToastItem);
};

const removeToast = (id: string) => {
  const index = toasts.value.findIndex((t) => t.id === id);
  if (index !== -1) {
    toasts.value.splice(index, 1);
  }
};

// Provide toast context to child components
provide<ToastContext>('toast', {
  addToast,
  removeToast: readonly(removeToast),
});

const handleClose = (id: string) => {
  removeToast(id);
};
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast-stack">
        <Toast
          v-for="toast in toasts"
          :key="toast.id"
          :id="toast.id"
          :type="toast.type"
          :title="toast.title"
          :message="toast.message"
          :duration="toast.duration"
          :closable="toast.closable"
          :action="toast.action"
          @close="handleClose"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.toast-container > * {
  pointer-events: auto;
}

/* Stack animations */
.toast-stack-enter-active {
  animation: stackIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-stack-leave-active {
  animation: stackOut 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-stack-move {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes stackIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes stackOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
}

/* Mobile responsive */
@media (max-width: 767px) {
  .toast-container {
    top: 16px;
    left: 16px;
    right: 16px;
  }
}
</style>
