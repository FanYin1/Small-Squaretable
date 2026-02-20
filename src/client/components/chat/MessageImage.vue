<template>
  <div class="message-image" @click="$emit('preview', src)">
    <img :src="src" :alt="alt" loading="lazy" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  src: string;
  alt?: string;
}>();
defineEmits(['preview']);
</script>
