<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface Props {
  src: string;
  alt: string;
  fallback?: string;
  width?: string | number;
  height?: string | number;
  objectFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
}

const props = withDefaults(defineProps<Props>(), {
  fallback: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
  objectFit: 'cover',
});

const isVisible = ref(false);
const isLoaded = ref(false);
const hasError = ref(false);
const imgRef = ref<HTMLImageElement>();

let observer: IntersectionObserver | null = null;

onMounted(() => {
  // Create Intersection Observer for lazy loading
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isVisible.value = true;
          // Stop observing once visible
          observer?.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: '50px 0px', // Start loading 50px before element comes into view
      threshold: 0.01,
    }
  );

  if (imgRef.value) {
    observer.observe(imgRef.value);
  }
});

onUnmounted(() => {
  observer?.disconnect();
});

function handleLoad() {
  isLoaded.value = true;
}

function handleError() {
  hasError.value = true;
}
</script>

<template>
  <div
    ref="imgRef"
    class="lazy-image-container"
    :style="{
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
    }"
  >
    <!-- Loading placeholder -->
    <div v-if="!isLoaded && !hasError" class="lazy-image-placeholder">
      <div class="skeleton-loader"></div>
    </div>

    <!-- Actual image -->
    <img
      v-if="isVisible"
      :src="hasError ? fallback : src"
      :alt="alt"
      :class="{ 'fade-in': isLoaded }"
      :style="{ objectFit }"
      @load="handleLoad"
      @error="handleError"
    />
  </div>
</template>

<style scoped>
.lazy-image-container {
  position: relative;
  overflow: hidden;
  background: #f3f4f6;
}

.lazy-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skeleton-loader {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    #f3f4f6 0%,
    #e5e7eb 50%,
    #f3f4f6 100%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  position: absolute;
  top: 0;
  left: 0;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.lazy-image-container img {
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
  display: block;
}

.lazy-image-container img.fade-in {
  opacity: 1;
}
</style>
