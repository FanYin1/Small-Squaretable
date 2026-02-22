<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { characterApi, type CharacterVersion } from '@client/services/character.api';
import { useDateTime } from '@client/composables/useDateTime';
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue';

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
    <el-button
      class="toggle-btn"
      text
      @click="expanded = !expanded"
    >
      <el-icon v-if="expanded"><arrow-up /></el-icon>
      <el-icon v-else><arrow-down /></el-icon>
      {{ t('characterEditor.versionHistory', 'Version History') }}
    </el-button>

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
  </div>
</template>

<style scoped>
.version-history {
  margin-top: 24px;
  background: var(--surface-card);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--border-default);
}

.toggle-btn {
  font-weight: 600;
  font-size: 14px;
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
