<script setup lang="ts">
export interface Props {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  text?: string;
}

withDefaults(defineProps<Props>(), {
  size: 'medium',
  color: '#3B82F6',
  text: ''
});
</script>

<template>
  <div class="loading-spinner" :class="[`size-${size}`]">
    <svg
      class="spinner"
      viewBox="0 0 50 50"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        class="spinner-path"
        cx="25"
        cy="25"
        r="20"
        fill="none"
        :stroke="color"
        stroke-width="4"
      />
    </svg>
    <span v-if="text" class="spinner-text">{{ text }}</span>
  </div>
</template>

<style scoped>
.loading-spinner {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.spinner {
  display: block;
  animation: rotate 1s linear infinite;
}

.size-small .spinner {
  width: 16px;
  height: 16px;
}

.size-medium .spinner {
  width: 24px;
  height: 24px;
}

.size-large .spinner {
  width: 32px;
  height: 32px;
}

.spinner-path {
  stroke-dasharray: 90, 150;
  stroke-dashoffset: 0;
  stroke-linecap: round;
  animation: dash 1.5s ease-in-out infinite;
}

@keyframes rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dash {
  0% {
    stroke-dasharray: 1, 200;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}

.spinner-text {
  font-size: 14px;
  color: #6B7280;
  margin: 0;
}
</style>
