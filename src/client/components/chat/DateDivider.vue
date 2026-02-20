<template>
  <div class="date-divider">
    <span>{{ formattedDate }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ date: string }>();

const formattedDate = computed(() => {
  return new Date(props.date).toLocaleDateString();
});
</script>
