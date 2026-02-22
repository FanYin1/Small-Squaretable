<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  characterGrowthApi,
  type CharacterGrowthData,
  type MilestoneInfo,
} from '@client/services/character-growth.api';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('GrowthPanel');

const props = defineProps<{
  characterId: string;
}>();

const { t } = useI18n();

const growth = ref<CharacterGrowthData | null>(null);
const milestones = ref<MilestoneInfo[]>([]);
const loading = ref(false);
const error = ref(false);

const xpPercentage = computed(() => {
  if (!growth.value) return 0;
  return growth.value.experience % 100;
});

const xpCurrent = computed(() => {
  if (!growth.value) return 0;
  return growth.value.experience % 100;
});

const MILESTONE_ICONS: Record<string, string> = {
  first_friend: '\u{1F91D}',
  regular: '\u{2B50}',
  best_friend: '\u{1F496}',
  soulmate: '\u{1F48E}',
};

async function loadGrowthData() {
  if (!props.characterId) return;
  loading.value = true;
  error.value = false;
  try {
    const [growthData, milestoneData] = await Promise.all([
      characterGrowthApi.getGrowth(props.characterId),
      characterGrowthApi.getMilestones(props.characterId),
    ]);
    growth.value = growthData;
    milestones.value = milestoneData;
  } catch (err) {
    logger.error('Failed to load growth data', err);
    error.value = true;
  } finally {
    loading.value = false;
  }
}

watch(() => props.characterId, () => {
  loadGrowthData();
});

onMounted(() => {
  loadGrowthData();
});
</script>

<template>
  <div class="growth-panel" v-loading="loading">
    <div v-if="error && !loading" class="growth-error">
      <el-empty :description="t('common.loadFailed')" :image-size="80">
        <el-button size="small" @click="loadGrowthData">{{ t('common.retry') }}</el-button>
      </el-empty>
    </div>

    <template v-else-if="growth">
      <!-- Level Badge -->
      <div class="level-section">
        <div class="level-badge">Lv.{{ growth.level }}</div>
      </div>

      <!-- XP Progress -->
      <div class="xp-section">
        <div class="xp-label">{{ t('character.experience') }}</div>
        <el-progress
          :percentage="xpPercentage"
          :stroke-width="12"
          :show-text="false"
          color="#409EFF"
        />
        <div class="xp-text">{{ xpCurrent }} / 100 XP</div>
      </div>

      <!-- Stats Row -->
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-value">{{ growth.totalMessages }}</span>
          <span class="stat-label">{{ t('character.totalMessages') }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ growth.totalChats }}</span>
          <span class="stat-label">{{ t('character.totalChats') }}</span>
        </div>
      </div>

      <!-- Milestones -->
      <div class="milestones-section">
        <div class="milestones-title">{{ t('character.milestones') }}</div>
        <div class="milestones-grid">
          <div
            v-for="ms in milestones"
            :key="ms.name"
            class="milestone-badge"
            :class="{ achieved: ms.achieved, locked: !ms.achieved }"
          >
            <span class="milestone-icon">{{ MILESTONE_ICONS[ms.name] || '\u{1F3C6}' }}</span>
            <span class="milestone-label">{{ ms.label }}</span>
            <span class="milestone-level">Lv.{{ ms.level }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.growth-panel {
  padding: 16px;
  min-height: 200px;
}

.growth-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.level-section {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #409EFF, #337ecc);
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
}

.xp-section {
  margin-bottom: 20px;
}

.xp-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.xp-text {
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: right;
  margin-top: 4px;
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-surface, #f5f7fa);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.milestones-section {
  margin-top: 4px;
}

.milestones-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.milestones-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.milestone-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-default, #dcdfe6);
  transition: all 0.2s;
}

.milestone-badge.achieved {
  background: linear-gradient(135deg, #f0f9ff, #e8f4fd);
  border-color: #409EFF;
}

.milestone-badge.locked {
  opacity: 0.45;
  filter: grayscale(1);
}

.milestone-icon {
  font-size: 24px;
}

.milestone-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

.milestone-level {
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
