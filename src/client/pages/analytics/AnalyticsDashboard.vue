<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAnalyticsStore } from '@client/stores/analytics';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import ExecutiveOverview from './ExecutiveOverview.vue';
import ProductMetrics from './ProductMetrics.vue';

const store = useAnalyticsStore();
const activeTab = ref('executive');

onMounted(() => {
  store.fetchAll();
});
</script>

<template>
  <DashboardLayout>
    <template #title>Analytics Dashboard</template>
    <template #subtitle>Data-driven insights for your platform</template>

    <div class="analytics-dashboard">
      <!-- Error banner -->
      <el-alert
        v-if="store.error"
        :title="store.error"
        type="error"
        show-icon
        closable
        class="error-banner"
      />

      <!-- Tab navigation -->
      <el-tabs v-model="activeTab" class="analytics-tabs">
        <el-tab-pane label="Executive Overview" name="executive">
          <ExecutiveOverview />
        </el-tab-pane>
        <el-tab-pane label="Product Metrics" name="product">
          <ProductMetrics />
        </el-tab-pane>
      </el-tabs>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.analytics-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  animation: fadeIn 0.3s var(--ease-out) both;
}

.error-banner {
  margin-bottom: 16px;
}

.analytics-tabs {
  margin-top: 8px;
}

.analytics-tabs :deep(.el-tabs__header) {
  margin-bottom: 24px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
