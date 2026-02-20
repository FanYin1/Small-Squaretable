<template>
  <div class="scroll-to-bottom" v-if="visible" @click="$emit('click')">
    <slot>↓</slot>
  </div>
</template>

<script setup lang="ts">
defineProps<{ visible?: boolean }>();
defineEmits(['click']);
</script>
