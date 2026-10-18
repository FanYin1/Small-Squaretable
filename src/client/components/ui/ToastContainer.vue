<script setup lang="ts">
import Toast from './Toast.vue';
import { toastStore } from '@client/composables/useToast';

// 队列在 useToast 模块里共享，这里只负责渲染
const { toasts, removeToast } = toastStore;

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

<style scoped lang="scss">
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
@include below(md) {
  .toast-container {
    top: 16px;
    left: 16px;
    right: 16px;
  }
}
</style>
