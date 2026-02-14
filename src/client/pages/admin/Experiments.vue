<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, VideoPlay, VideoPause, DataAnalysis, Delete } from '@element-plus/icons-vue';
import { api } from '@client/services/api';
import { useToast } from '@client/composables';

const { t } = useI18n();
const toast = useToast();

interface Variant {
  name: string;
  weight: number;
  config: Record<string, unknown>;
}

interface Experiment {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'completed';
  variants: Variant[];
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface VariantMetrics {
  variant: string;
  impressions: number;
  clicks: number;
  chatStarts: number;
  ctr: number;
}

const experiments = ref<Experiment[]>([]);
const loading = ref(false);
const createDialogVisible = ref(false);
const resultsDialogVisible = ref(false);
const resultsLoading = ref(false);
const currentResults = ref<VariantMetrics[]>([]);
const currentResultsName = ref('');

// PLACEHOLDER_FORM

const form = ref({
  name: '',
  description: '',
  variants: [
    { name: 'control', weight: 50, configJson: '{}' },
    { name: 'variant-a', weight: 50, configJson: '{}' },
  ] as Array<{ name: string; weight: number; configJson: string }>,
});

function addVariant() {
  form.value.variants.push({ name: '', weight: 50, configJson: '{}' });
}

function removeVariant(index: number) {
  if (form.value.variants.length > 1) {
    form.value.variants.splice(index, 1);
  }
}

async function fetchExperiments() {
  loading.value = true;
  try {
    const res = await api.get('/api/v1/admin/experiments');
    const data = await res.json();
    if (data.success) experiments.value = data.data;
  } catch {
    toast.error('Failed to load experiments');
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  try {
    const variants = form.value.variants.map((v) => ({
      name: v.name,
      weight: v.weight,
      config: JSON.parse(v.configJson || '{}'),
    }));
    const res = await api.post('/api/v1/admin/experiments', {
      json: { name: form.value.name, description: form.value.description, variants },
    });
    const data = await res.json();
    if (data.success) {
      experiments.value.push(data.data);
      createDialogVisible.value = false;
      resetForm();
      toast.success('Experiment created');
    }
  } catch {
    toast.error('Failed to create experiment');
  }
}

// PLACEHOLDER_ACTIONS

async function handleStatusChange(exp: Experiment, status: 'running' | 'completed') {
  try {
    const res = await api.patch(`/api/v1/admin/experiments/${exp.id}`, {
      json: { status },
    });
    const data = await res.json();
    if (data.success) {
      const idx = experiments.value.findIndex((e) => e.id === exp.id);
      if (idx !== -1) experiments.value[idx] = data.data;
      toast.success(`Experiment ${status === 'running' ? 'started' : 'stopped'}`);
    }
  } catch {
    toast.error('Failed to update experiment');
  }
}

async function viewResults(exp: Experiment) {
  currentResultsName.value = exp.name;
  resultsDialogVisible.value = true;
  resultsLoading.value = true;
  try {
    const res = await api.get(`/api/v1/admin/experiments/${exp.id}/results`);
    const data = await res.json();
    if (data.success) currentResults.value = data.data;
  } catch {
    toast.error('Failed to load results');
  } finally {
    resultsLoading.value = false;
  }
}

function resetForm() {
  form.value = {
    name: '',
    description: '',
    variants: [
      { name: 'control', weight: 50, configJson: '{}' },
      { name: 'variant-a', weight: 50, configJson: '{}' },
    ],
  };
}

function statusType(status: string) {
  if (status === 'running') return 'success';
  if (status === 'completed') return 'info';
  return 'warning';
}

function formatDate(d?: string) {
  if (!d) return '-';
  return new Date(d).toLocaleString();
}

onMounted(() => fetchExperiments());
</script>

<!-- PLACEHOLDER_TEMPLATE -->

<template>
  <div class="experiments-page">
    <div class="page-header">
      <h2 class="page-title">{{ t('admin.experiments.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="createDialogVisible = true">
        {{ t('admin.experiments.create') }}
      </el-button>
    </div>

    <el-table v-loading="loading" :data="experiments" stripe row-key="id" class="experiments-table">
      <el-table-column prop="name" :label="t('admin.experiments.name')" min-width="180" />
      <el-table-column :label="t('admin.experiments.status')" width="120">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('admin.experiments.variants')" width="100" align="center">
        <template #default="{ row }">{{ row.variants?.length || 0 }}</template>
      </el-table-column>
      <el-table-column :label="t('admin.experiments.started')" width="180">
        <template #default="{ row }">{{ formatDate(row.startedAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('admin.experiments.ended')" width="180">
        <template #default="{ row }">{{ formatDate(row.endedAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('admin.experiments.actions')" width="260" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'draft'"
            size="small"
            type="success"
            :icon="VideoPlay"
            @click="handleStatusChange(row, 'running')"
          >Start</el-button>
          <el-button
            v-if="row.status === 'running'"
            size="small"
            type="warning"
            :icon="VideoPause"
            @click="handleStatusChange(row, 'completed')"
          >Stop</el-button>
          <el-button
            size="small"
            :icon="DataAnalysis"
            @click="viewResults(row)"
          >Results</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && experiments.length === 0" description="No experiments yet" />

    <!-- PLACEHOLDER_DIALOGS -->

    <!-- Create Dialog -->
    <el-dialog v-model="createDialogVisible" :title="t('admin.experiments.create')" width="600px">
      <el-form label-position="top">
        <el-form-item :label="t('admin.experiments.name')">
          <el-input v-model="form.name" placeholder="e.g. homepage-layout" />
        </el-form-item>
        <el-form-item :label="t('admin.experiments.description')">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('admin.experiments.variants')">
          <div class="variants-editor">
            <div v-for="(v, i) in form.variants" :key="i" class="variant-row">
              <el-input v-model="v.name" placeholder="Variant name" class="variant-name" />
              <el-input-number v-model="v.weight" :min="1" :max="100" class="variant-weight" />
              <el-input v-model="v.configJson" placeholder="{}" type="textarea" :rows="1" class="variant-config" />
              <el-button :icon="Delete" circle size="small" :disabled="form.variants.length <= 1" @click="removeVariant(i)" />
            </div>
            <el-button size="small" :icon="Plus" @click="addVariant">Add Variant</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">Cancel</el-button>
        <el-button type="primary" :disabled="!form.name || form.variants.length === 0" @click="handleCreate">Create</el-button>
      </template>
    </el-dialog>

    <!-- Results Dialog -->
    <el-dialog v-model="resultsDialogVisible" :title="`Results: ${currentResultsName}`" width="700px">
      <div v-loading="resultsLoading">
        <el-table v-if="currentResults.length > 0" :data="currentResults" stripe>
          <el-table-column prop="variant" label="Variant" width="150" />
          <el-table-column prop="impressions" label="Impressions" width="120" align="right" />
          <el-table-column prop="clicks" label="Clicks" width="100" align="right" />
          <el-table-column prop="chatStarts" label="Chat Starts" width="120" align="right" />
          <el-table-column label="CTR" width="160">
            <template #default="{ row }">
              <div class="ctr-cell">
                <el-progress :percentage="Math.round(row.ctr * 100)" :stroke-width="14" :text-inside="true" />
              </div>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="!resultsLoading" description="No results data available" />
      </div>
    </el-dialog>
  </div>
</template>

<!-- PLACEHOLDER_STYLE -->

<style scoped>
.experiments-page {
  max-width: 1200px;
  margin: 0 auto;
  animation: fadeIn 0.3s var(--ease-out) both;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.experiments-table {
  border-radius: 8px;
  overflow: hidden;
}

.variants-editor {
  width: 100%;
}

.variant-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.variant-name {
  flex: 1;
}

.variant-weight {
  width: 100px;
}

.variant-config {
  flex: 1;
}

.ctr-cell {
  min-width: 100px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
