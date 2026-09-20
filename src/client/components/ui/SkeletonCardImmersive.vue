<script setup lang="ts">
/**
 * 沉浸版骨架屏（样板）
 * 形状与 CharacterCardImmersive 的 3:4 竖卡对齐，避免加载完成时跳版。
 */
withDefaults(
  defineProps<{
    count?: number;
  }>(),
  { count: 8 }
);
</script>

<template>
  <div class="im-skel-grid" aria-hidden="true">
    <div v-for="i in count" :key="i" class="im-skel">
      <div class="im-skel__body">
        <div class="im-skel__line im-skel__line--tag"></div>
        <div class="im-skel__line im-skel__line--name"></div>
        <div class="im-skel__line im-skel__line--meta"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.im-skel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 20px;
}

.im-skel {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: var(--im-radius-lg);
  border: 1px solid var(--im-border);
  overflow: hidden;
  background: linear-gradient(
    100deg,
    var(--im-surface) 20%,
    var(--im-raised) 50%,
    var(--im-surface) 80%
  );
  background-size: 220% 100%;
  animation: im-skel-shimmer 1.4s infinite linear;
}

@keyframes im-skel-shimmer {
  from {
    background-position: 220% 0;
  }
  to {
    background-position: -220% 0;
  }
}

.im-skel__body {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px;
}

.im-skel__line {
  height: 10px;
  border-radius: var(--im-radius-pill);
  background: var(--im-overlay);
}

.im-skel__line--tag {
  width: 38%;
  height: 8px;
}

.im-skel__line--name {
  width: 68%;
  height: 16px;
}

.im-skel__line--meta {
  width: 50%;
}

@media (max-width: 1023px) {
  .im-skel-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 560px) {
  .im-skel-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}
</style>
