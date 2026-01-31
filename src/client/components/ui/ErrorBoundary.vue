<script setup lang="ts">
import { ref } from 'vue';
import { ElResult, ElButton } from 'element-plus';
import { WarningFilled } from '@element-plus/icons-vue';

interface Props {
  title?: string;
  description?: string;
}

withDefaults(defineProps<Props>(), {
  title: 'Something went wrong',
  description: 'An unexpected error occurred. Please try again.',
});

const emit = defineEmits<{
  retry: [];
}>();

const hasError = ref(false);
const errorMessage = ref('');

const handleRetry = () => {
  hasError.value = false;
  errorMessage.value = '';
  emit('retry');
};

const handleError = (error: Error) => {
  hasError.value = true;
  errorMessage.value = error.message;
  console.error('Error caught by ErrorBoundary:', error);
};

defineExpose({
  handleError,
});
</script>

<template>
  <div v-if="hasError" class="error-boundary">
    <ElResult icon="warning" :title="title" :sub-title="description">
      <template #extra>
        <div class="error-details">
          <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
          <ElButton type="primary" @click="handleRetry">Retry</ElButton>
        </div>
      </template>
    </ElResult>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 20px;
}

.error-details {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.error-message {
  color: #606266;
  font-size: 14px;
  margin: 0;
  max-width: 400px;
  text-align: center;
  word-break: break-word;
}
</style>
