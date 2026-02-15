<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  avatarUrl: string;
  disabled: boolean;
}>();

defineEmits<{
  upload: [file: File];
}>();

function handleUpload() {
  if (props.disabled) return;
  ElMessage.info(t('profile.avatarComingSoon'));
}
</script>

<template>
  <div class="avatar-upload">
    <el-avatar :size="120" :src="avatarUrl" />
    <el-button
      v-if="!disabled"
      class="upload-btn"
      :icon="Plus"
      circle
      @click="handleUpload"
    />
  </div>
</template>

<style scoped>
.avatar-upload {
  position: relative;
  display: inline-block;
}

.upload-btn {
  position: absolute;
  bottom: 0;
  right: 0;
}
</style>
