<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { characterTemplateApi } from '@client/services/character-template.api';
import { useToast } from '@client/composables/useToast';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import type { CharacterTemplate } from '@client/types';

const router = useRouter();
const { t } = useI18n();
const toast = useToast();

const templates = ref<CharacterTemplate[]>([]);
const loading = ref(false);
const selectedCategory = ref('');
const currentPage = ref(1);
const pageSize = 12;
const total = ref(0);

// Rating state
const ratings = reactive<Record<string, { average: number; count: number }>>({});
const ratingDialogVisible = ref(false);
const ratingTemplateId = ref('');
const ratingValue = ref(0);

async function loadTemplates() {
  loading.value = true;
  try {
    const res = await characterTemplateApi.listTemplates({
      page: currentPage.value,
      limit: pageSize,
      category: selectedCategory.value || undefined,
    });
    templates.value = res.items;
    const pagination = res.pagination as { total?: number };
    total.value = pagination?.total ?? res.items.length;
    // Load ratings for all templates
    for (const tmpl of res.items) {
      loadRating(tmpl.id);
    }
  } catch {
    templates.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadRating(templateId: string) {
  try {
    const data = await characterTemplateApi.getTemplateRating(templateId);
    ratings[templateId] = data;
  } catch {
    // Silently ignore rating load failures
  }
}

function handlePageChange(page: number) {
  currentPage.value = page;
  loadTemplates();
}

function useTemplate(id: string) {
  router.push({ name: 'CharacterCreate', query: { templateId: id } });
}

function openRatingDialog(templateId: string) {
  ratingTemplateId.value = templateId;
  ratingValue.value = 0;
  ratingDialogVisible.value = true;
}

async function submitRating() {
  if (ratingValue.value < 1 || ratingValue.value > 5) return;
  try {
    await characterTemplateApi.rateTemplate(ratingTemplateId.value, ratingValue.value);
    toast.success(t('characterTemplates.ratingSuccess'));
    ratingDialogVisible.value = false;
    loadRating(ratingTemplateId.value);
  } catch {
    // Error handled by API interceptor
  }
}

onMounted(loadTemplates);
</script>

<template>
  <DashboardLayout>
    <template #title>
      {{ t('characterTemplates.title') }}
    </template>

    <div class="character-templates-page">
      <div class="category-tabs">
        <el-radio-group v-model="selectedCategory" @change="currentPage = 1; loadTemplates()">
          <el-radio-button value="">{{ t('characterTemplates.allCategories') }}</el-radio-button>
          <el-radio-button value="assistant">Assistant</el-radio-button>
          <el-radio-button value="roleplay">Roleplay</el-radio-button>
          <el-radio-button value="education">Education</el-radio-button>
          <el-radio-button value="creative">Creative</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="loading" class="loading">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else-if="templates.length === 0" class="empty">
        <el-empty :description="t('characterTemplates.noTemplates')" />
      </div>

      <div v-else class="template-grid">
        <el-card v-for="tmpl in templates" :key="tmpl.id" class="template-card" shadow="hover">
          <div class="template-header">
            <el-avatar :src="tmpl.avatarUrl" :size="48">{{ tmpl.name[0] }}</el-avatar>
            <div class="template-info">
              <h3>{{ tmpl.name }}</h3>
              <el-tag v-if="tmpl.category" size="small">{{ tmpl.category }}</el-tag>
            </div>
          </div>
          <p class="template-desc">{{ tmpl.description }}</p>
          <div v-if="ratings[tmpl.id]" class="template-rating" @click.stop="openRatingDialog(tmpl.id)">
            <span class="rating-stars" role="img" :aria-label="t('characterTemplates.rating')">&#9733;</span>
            <span class="rating-value">{{ ratings[tmpl.id].average }}</span>
            <span class="rating-count">({{ ratings[tmpl.id].count }})</span>
          </div>
          <div class="template-footer">
            <span class="usage-count">{{ t('characterTemplates.usageCount', { count: tmpl.usageCount }) }}</span>
            <div class="template-actions">
              <el-button size="small" @click="openRatingDialog(tmpl.id)">
                {{ t('characterTemplates.rateTemplate') }}
              </el-button>
              <el-button type="primary" size="small" @click="useTemplate(tmpl.id)">
                {{ t('characterTemplates.useTemplate') }}
              </el-button>
            </div>
          </div>
        </el-card>
      </div>

      <el-pagination
        v-if="total > pageSize"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="handlePageChange"
        class="pagination"
      />
    </div>

    <el-dialog v-model="ratingDialogVisible" :title="t('characterTemplates.rateTemplate')" width="360px">
      <div class="rating-dialog-body">
        <el-rate v-model="ratingValue" :max="5" />
      </div>
      <template #footer>
        <el-button @click="ratingDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="ratingValue < 1" @click="submitRating">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </DashboardLayout>
</template>

<style scoped>
.character-templates-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.category-tabs {
  margin-bottom: 24px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.template-card {
  cursor: default;
}

.template-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.template-info h3 {
  margin: 0 0 4px;
  font-size: 16px;
}

.template-desc {
  color: var(--text-secondary, #606266);
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 16px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.template-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-actions {
  display: flex;
  gap: 8px;
}

.template-rating {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  cursor: pointer;
  font-size: 14px;
}

.rating-stars {
  color: #f7ba2a;
  font-size: 16px;
}

.rating-value {
  font-weight: 600;
}

.rating-count {
  color: var(--text-secondary, #909399);
  font-size: 12px;
}

.rating-dialog-body {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.usage-count {
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

.pagination {
  margin-top: 24px;
  justify-content: center;
}

.loading,
.empty {
  padding: 40px 0;
}

@media (max-width: 767px) {
  .character-templates-page {
    padding: 16px;
  }

  .template-grid {
    grid-template-columns: 1fr;
  }
}
</style>
