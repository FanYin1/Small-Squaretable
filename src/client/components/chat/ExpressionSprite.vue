<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  expressions: Record<string, string>;
  emotionLabel: string;
}>();

const spriteUrl = computed(() => {
  return props.expressions[props.emotionLabel]
    || props.expressions['neutral']
    || props.expressions['default']
    || null;
});
</script>

<template>
  <div v-if="spriteUrl" class="expression-sprite">
    <img :src="spriteUrl" :alt="emotionLabel" class="sprite-image" />
  </div>
</template>

<style scoped>
.expression-sprite {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.sprite-image {
  max-height: 200px;
  max-width: 100%;
  object-fit: contain;
  border-radius: 8px;
  transition: opacity 0.3s ease;
}
</style>
