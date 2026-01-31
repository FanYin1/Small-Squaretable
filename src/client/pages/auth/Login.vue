<script setup lang="ts">
</script>

<template>
  <div class="placeholder-page">
    <el-card class="placeholder-card">
      <div class="placeholder-content">
        <h1>登录页面</h1>
        <p class="placeholder-text">Task 5 实现</p>
        <el-divider />
        <p class="info-text">此页面将在 Task 5 中实现完整的登录功能</p>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.placeholder-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.placeholder-card {
  max-width: 500px;
  width: 100%;
}

.placeholder-content {
  text-align: center;
  padding: 40px 20px;
}

.placeholder-content h1 {
  font-size: 32px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px 0;
}

.placeholder-text {
  font-size: 18px;
  color: #909399;
  margin: 0;
}

.info-text {
  font-size: 14px;
  color: #606266;
  margin: 16px 0 0 0;
}

/* Dark theme support preparation */
@media (prefers-color-scheme: dark) {
  .placeholder-content h1 {
    color: var(--el-text-color-primary);
  }

  .placeholder-text {
    color: var(--el-text-color-secondary);
  }

  .info-text {
    color: var(--el-text-color-regular);
  }
}
</style>
