<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';

const { t } = useI18n();
</script>

<template>
  <DashboardLayout>
    <template #title>{{ t('legal.privacyTitle') }}</template>

    <div class="legal-page">
      <div class="legal-content">
        <p v-for="(paragraph, idx) in t('legal.privacyContent').split('\n\n')" :key="idx">
          {{ paragraph }}
        </p>
      </div>
      <div class="legal-footer">
        <router-link :to="{ name: 'Home' }" class="back-link">
          {{ t('legal.backToHome') }}
        </router-link>
      </div>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.legal-page {
  max-width: 800px;
  margin: 0 auto;
}

.legal-content p {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-primary);
  margin: 0 0 16px 0;
  white-space: pre-line;
}

.legal-footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border-default);
}

.back-link {
  color: var(--accent-text);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}
</style>
