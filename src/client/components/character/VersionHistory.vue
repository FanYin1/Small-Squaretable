<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { characterApi, type CharacterVersion } from '@client/services/character.api';
import { useDateTime } from '@client/composables/useDateTime';
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue';
import VersionDiff from './VersionDiff.vue';

const props = defineProps<{
  characterId: string;
}>();

const emit = defineEmits<{
  restore: [cardData: Record<string, unknown>];
}>();

const { t } = useI18n();
const { formatRelativeTime } = useDateTime();

const versions = ref<CharacterVersion[]>([]);
const loading = ref(false);
const expanded = ref(false);

const selectedVersions = ref<number[]>([]);
const showDiff = ref(false);

function toggleVersionSelect(version: number) {
  const idx = selectedVersions.value.indexOf(version);
  if (idx >= 0) {
    selectedVersions.value.splice(idx, 1);
  } else if (selectedVersions.value.length < 2) {
    selectedVersions.value.push(version);
  }
}

const canCompare = computed(() => selectedVersions.value.length === 2);
const diffFrom = computed(() => Math.min(...selectedVersions.value));
const diffTo = computed(() => Math.max(...selectedVersions.value));

async function fetchVersions() {
  loading.value = true;
  try {
    versions.value = await characterApi.getVersions(props.characterId);
  } catch {
    versions.value = [];
  } finally {
    loading.value = false;
  }
}

function handleRestore(version: CharacterVersion) {
  emit('restore', version.cardData);
}

onMounted(() => {
  fetchVersions();
});
</script>

<template>
  <div class="version-history">
    <div class="version-header">
      <el-button
        class="toggle-btn"
        text
        @click="expanded = !expanded"
      >
        <el-icon v-if="expanded"><arrow-up /></el-icon>
        <el-icon v-else><arrow-down /></el-icon>
        {{ t('characterEditor.versionHistory', 'Version History') }}
      </el-button>

      <el-button
        v-if="expanded && versions.length >= 2"
        size="small"
        type="primary"
        :disabled="!canCompare"
        @click="showDiff = true"
      >
        {{ t('characterEditor.compareVersions', 'Compare') }}
      </el-button>
    </div>

    <div v-if="expanded && !canCompare && versions.length >= 2" class="compare-hint">
      {{ t('characterEditor.selectToCompare', 'Select 2 versions to compare') }}
    </div>

    <div v-show="expanded" class="version-content">
      <el-skeleton v-if="loading" :rows="3" animated />

      <div v-else-if="versions.length === 0" class="empty-state">
        {{ t('characterEditor.noVersionHistory', 'No version history yet') }}
      </div>

      <el-timeline v-else>
        <el-timeline-item
          v-for="ver in versions"
          :key="ver.id"
          :timestamp="formatRelativeTime(ver.createdAt)"
          placement="top"
        >
          <div class="version-item">
            <el-checkbox
              :model-value="selectedVersions.includes(ver.version)"
              :disabled="!selectedVersions.includes(ver.version) && selectedVersions.length >= 2"
              @change="toggleVersionSelect(ver.version)"
            />
            <span class="version-label">
              {{ t('characterEditor.versionLabel', 'Version') }} {{ ver.version }}
            </span>
            <span v-if="ver.changeNote" class="change-note">{{ ver.changeNote }}</span>
            <el-button
              size="small"
              type="warning"
              @click="handleRestore(ver)"
            >
              {{ t('characterEditor.restoreVersion', 'Restore') }}
            </el-button>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>

    <VersionDiff
      :character-id="characterId"
      :from-version="diffFrom"
      :to-version="diffTo"
      :visible="showDiff"
      @update:visible="showDiff = $event"
    />
  </div>
</template>

<style scoped>
.version-history {
  margin-top: 24px;
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-default);
}

.version-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-btn {
  font-weight: 600;
  font-size: 14px;
}

.compare-hint {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 4px;
  padding-left: 4px;
}

.version-content {
  margin-top: 12px;
}

.empty-state {
  color: var(--text-secondary);
  font-size: 14px;
  padding: 12px 0;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.version-label {
  font-weight: 600;
}

.change-note {
  color: var(--text-secondary);
  font-size: 13px;
  flex: 1;
}
</style>
