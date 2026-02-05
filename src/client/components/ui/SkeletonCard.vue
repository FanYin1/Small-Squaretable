<script setup lang="ts">
export interface Props {
  count?: number;
}

withDefaults(defineProps<Props>(), {
  count: 6
});
</script>

<template>
  <div class="skeleton-grid">
    <div
      v-for="index in count"
      :key="index"
      class="skeleton-card"
    >
      <!-- Avatar skeleton -->
      <div class="skeleton-avatar"></div>

      <!-- Content skeletons -->
      <div class="skeleton-content">
        <div class="skeleton-title"></div>
        <div class="skeleton-text skeleton-text-1"></div>
        <div class="skeleton-text skeleton-text-2"></div>

        <!-- Tags skeleton -->
        <div class="skeleton-tags">
          <div class="skeleton-tag"></div>
          <div class="skeleton-tag"></div>
        </div>

        <!-- Footer skeleton -->
        <div class="skeleton-footer">
          <div class="skeleton-rating"></div>
          <div class="skeleton-button"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 24px;
}

@media (min-width: 768px) {
  .skeleton-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .skeleton-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1280px) {
  .skeleton-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.skeleton-card {
  width: 100%;
  height: 280px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #F3F4F6;
  align-self: center;
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.skeleton-title {
  width: 70%;
  height: 20px;
  background: #F3F4F6;
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-text {
  width: 100%;
  height: 14px;
  background: #F3F4F6;
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-text-1 {
  animation-delay: 0.1s;
}

.skeleton-text-2 {
  width: 60%;
  animation-delay: 0.2s;
}

.skeleton-tags {
  display: flex;
  gap: 6px;
}

.skeleton-tag {
  width: 50px;
  height: 22px;
  background: #F3F4F6;
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-tags .skeleton-tag:nth-child(2) {
  animation-delay: 0.1s;
}

.skeleton-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid #F3F4F6;
}

.skeleton-rating {
  width: 60px;
  height: 16px;
  background: #F3F4F6;
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-button {
  width: 80px;
  height: 32px;
  background: #F3F4F6;
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
