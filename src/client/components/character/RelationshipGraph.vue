<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  characterRelationshipApi,
  type CharacterRelationship,
  type CreateRelationshipRequest,
  type UpdateRelationshipRequest,
} from '@client/services/character-relationship.api';
import { characterApi } from '@client/services/character.api';
import type { Character } from '@client/types';
import { createLogger } from '@client/utils/logger';

use([GraphChart, TooltipComponent, CanvasRenderer]);

const logger = createLogger('RelationshipGraph');

const props = defineProps<{
  characterId: string;
  characterName: string;
}>();

const { t } = useI18n();

// State
const relationships = ref<CharacterRelationship[]>([]);
const loading = ref(false);
const showAddDialog = ref(false);
const showEditDialog = ref(false);
const editingRelationship = ref<CharacterRelationship | null>(null);
const characterOptions = ref<Character[]>([]);
const searchLoading = ref(false);
const submitting = ref(false);
const characterNames = ref<Record<string, string>>({});

const RELATIONSHIP_TYPES = [
  'friend', 'rival', 'mentor', 'student', 'lover', 'family', 'acquaintance',
] as const;

const TYPE_COLORS: Record<string, string> = {
  friend: '#67C23A',
  rival: '#F56C6C',
  mentor: '#409EFF',
  student: '#E6A23C',
  lover: '#E040A0',
  family: '#909399',
  acquaintance: '#C0C4CC',
};

const defaultForm = (): CreateRelationshipRequest => ({
  characterId: props.characterId,
  targetCharacterId: undefined,
  type: 'friend',
  affinity: 0.5,
  label: undefined,
  description: undefined,
});

const form = ref<CreateRelationshipRequest>(defaultForm());

// Resolve character names for graph node labels
async function resolveCharacterNames(rels: CharacterRelationship[]) {
  const ids = rels
    .map((r) => r.targetCharacterId)
    .filter((id): id is string => !!id && !characterNames.value[id]);
  for (const id of ids) {
    try {
      const char = await characterApi.getCharacter(id);
      if (char && typeof char === 'object' && 'name' in char) {
        characterNames.value[id] = (char as Character).name;
      }
    } catch {
      // Character may have been deleted; skip
    }
  }
}

// Load relationships
async function loadRelationships() {
  loading.value = true;
  try {
    relationships.value = await characterRelationshipApi.getRelationships(props.characterId);
    await resolveCharacterNames(relationships.value);
  } catch (error) {
    logger.error('Failed to load relationships', error);
    ElMessage.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

// Search characters for selector
async function searchCharacters(query: string) {
  if (!query) return;
  searchLoading.value = true;
  try {
    const result = await characterApi.getCharacters({ search: query, limit: 20 });
    characterOptions.value = result.characters.filter((c) => c.id !== props.characterId);
  } catch (error) {
    logger.error('Failed to search characters', error);
  } finally {
    searchLoading.value = false;
  }
}

// Create relationship
async function handleCreate() {
  submitting.value = true;
  try {
    await characterRelationshipApi.createRelationship(form.value);
    ElMessage.success(t('common.createSuccess'));
    showAddDialog.value = false;
    form.value = defaultForm();
    await loadRelationships();
  } catch (error) {
    logger.error('Failed to create relationship', error);
    ElMessage.error(t('common.createFailed'));
  } finally {
    submitting.value = false;
  }
}

// Update relationship
async function handleUpdate() {
  if (!editingRelationship.value) return;
  submitting.value = true;
  try {
    const data: UpdateRelationshipRequest = {
      type: form.value.type,
      affinity: form.value.affinity,
      label: form.value.label || null,
      description: form.value.description || null,
    };
    await characterRelationshipApi.updateRelationship(editingRelationship.value.id, data);
    ElMessage.success(t('common.updateSuccess'));
    showEditDialog.value = false;
    editingRelationship.value = null;
    form.value = defaultForm();
    await loadRelationships();
  } catch (error) {
    logger.error('Failed to update relationship', error);
    ElMessage.error(t('common.updateFailed'));
  } finally {
    submitting.value = false;
  }
}

// Delete relationship
async function handleDelete() {
  if (!editingRelationship.value) return;
  submitting.value = true;
  try {
    await characterRelationshipApi.deleteRelationship(editingRelationship.value.id);
    ElMessage.success(t('common.deleteSuccess'));
    showEditDialog.value = false;
    editingRelationship.value = null;
    form.value = defaultForm();
    await loadRelationships();
  } catch (error) {
    logger.error('Failed to delete relationship', error);
    ElMessage.error(t('common.deleteFailed'));
  } finally {
    submitting.value = false;
  }
}

// Open edit dialog from graph click
function openEditDialog(rel: CharacterRelationship) {
  editingRelationship.value = rel;
  form.value = {
    characterId: rel.characterId,
    targetCharacterId: rel.targetCharacterId,
    type: rel.type as CreateRelationshipRequest['type'],
    affinity: Number(rel.affinity),
    label: rel.label,
    description: rel.description,
  };
  showEditDialog.value = true;
}

function openAddDialog() {
  form.value = defaultForm();
  showAddDialog.value = true;
}

// Graph data
const nodes = computed(() => {
  const centerNode = {
    name: props.characterName,
    symbolSize: 50,
    itemStyle: { color: '#409EFF', borderColor: '#337ecc', borderWidth: 3 },
    label: { fontWeight: 'bold' as const },
    _id: props.characterId,
  };

  const relNodes = relationships.value.map((rel) => {
    const affinity = Number(rel.affinity);
    const size = 20 + affinity * 30;
    return {
      name: (rel.targetCharacterId && characterNames.value[rel.targetCharacterId]) || rel.label || rel.type,
      symbolSize: size,
      itemStyle: { color: TYPE_COLORS[rel.type] || '#C0C4CC' },
      _id: rel.id,
      _rel: rel,
    };
  });

  return [centerNode, ...relNodes];
});

const links = computed(() =>
  relationships.value.map((rel, index) => ({
    source: 0,
    target: index + 1,
    value: rel.type,
    lineStyle: {
      width: 1 + Number(rel.affinity) * 4,
      color: TYPE_COLORS[rel.type] || '#C0C4CC',
    },
  })),
);

const graphOption = computed(() => ({
  tooltip: { trigger: 'item' as const },
  series: [
    {
      type: 'graph' as const,
      layout: 'force' as const,
      roam: true,
      force: { repulsion: 200, edgeLength: [100, 200] },
      data: nodes.value,
      links: links.value,
      label: { show: true, position: 'bottom' as const },
      edgeLabel: { show: true, formatter: '{c}' },
      lineStyle: { curveness: 0.1 },
    },
  ],
}));

function handleChartClick(params: { dataType: string; dataIndex: number; data?: { _rel?: CharacterRelationship } }) {
  if (params.dataType === 'node' && params.dataIndex > 0 && params.data?._rel) {
    openEditDialog(params.data._rel);
  }
}

watch(() => props.characterId, () => {
  loadRelationships();
});

onMounted(() => {
  loadRelationships();
});
</script>

<template>
  <div class="relationship-graph">
    <div class="graph-header">
      <h3>{{ t('character.relationships') }}</h3>
      <el-button type="primary" :icon="Plus" size="small" @click="openAddDialog">
        {{ t('character.addRelationship') }}
      </el-button>
    </div>

    <div v-loading="loading" class="graph-container">
      <VChart
        v-if="relationships.length > 0"
        :option="graphOption"
        autoresize
        class="chart"
        @click="handleChartClick"
      />
      <el-empty
        v-else-if="!loading"
        :description="t('character.noRelationships')"
      />
    </div>

    <!-- Add Relationship Dialog -->
    <el-dialog v-model="showAddDialog" :title="t('character.addRelationship')" width="500px">
      <el-form label-position="top">
        <el-form-item :label="t('character.targetCharacter')">
          <el-select
            v-model="form.targetCharacterId"
            filterable
            remote
            :remote-method="searchCharacters"
            :loading="searchLoading"
            :placeholder="t('character.searchCharacter')"
            style="width: 100%"
          >
            <el-option
              v-for="c in characterOptions"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('character.relationshipType')">
          <el-select v-model="form.type" style="width: 100%">
            <el-option
              v-for="rt in RELATIONSHIP_TYPES"
              :key="rt"
              :label="t(`character.relType.${rt}`)"
              :value="rt"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('character.affinity')">
          <el-slider v-model="form.affinity" :min="0" :max="1" :step="0.1" show-stops />
        </el-form-item>
        <el-form-item :label="t('character.relationshipLabel')">
          <el-input v-model="form.label" :placeholder="t('character.relationshipLabelPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('character.relationshipDescription')">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            :placeholder="t('character.relationshipDescriptionPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">
          {{ t('common.create') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Edit Relationship Dialog -->
    <el-dialog v-model="showEditDialog" :title="t('character.editRelationship')" width="500px">
      <el-form label-position="top">
        <el-form-item :label="t('character.relationshipType')">
          <el-select v-model="form.type" style="width: 100%">
            <el-option
              v-for="rt in RELATIONSHIP_TYPES"
              :key="rt"
              :label="t(`character.relType.${rt}`)"
              :value="rt"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('character.affinity')">
          <el-slider v-model="form.affinity" :min="0" :max="1" :step="0.1" show-stops />
        </el-form-item>
        <el-form-item :label="t('character.relationshipLabel')">
          <el-input v-model="form.label" :placeholder="t('character.relationshipLabelPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('character.relationshipDescription')">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            :placeholder="t('character.relationshipDescriptionPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="danger" :icon="Delete" :loading="submitting" @click="handleDelete">
          {{ t('common.delete') }}
        </el-button>
        <el-button @click="showEditDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleUpdate">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.relationship-graph {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.graph-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.graph-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart {
  width: 100%;
  height: 400px;
}
</style>
