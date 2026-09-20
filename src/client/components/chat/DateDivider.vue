<template>
  <div class="date-divider">
    <span>{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<style scoped>
.date-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 8px;
}

.date-divider span {
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-base, var(--chat-bg, #FAF9F6));
  padding: 2px 12px;
  border-radius: 10px;
  font-weight: 500;
}
</style>
