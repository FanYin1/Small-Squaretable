<template>
  <el-dialog
    v-model="visible"
    title="World Book Scan Tester"
    width="90%"
    :fullscreen="isFullscreen"
    class="worldbook-tester-dialog"
  >
    <div class="worldbook-tester">
      <div class="tester-input">
        <el-input
          v-model="testText"
          type="textarea"
          :rows="6"
          placeholder="Enter test text to see which World Info entries would be triggered..."
          @input="debouncedScan"
        />
        <div class="input-actions">
          <el-button @click="scanEntries" type="primary" :loading="scanning">
            <el-icon><Search /></el-icon> Scan
          </el-button>
          <el-button @click="testText = ''">Clear</el-button>
          <el-button @click="isFullscreen = !isFullscreen" text>
            <el-icon v-if="!isFullscreen"><FullScreen /></el-icon>
            <el-icon v-else><Close /></el-icon>
          </el-button>
        </div>
      </div>

      <div class="scan-results">
        <p v-if="diagnostics?.constantBudgetOverflow">常驻条目已超过世界书选择预算，仍保留；生成时会检查模型总容量。</p>
        <p v-if="scanNote">{{ scanNote }}</p>
        <p>sticky（持续生效）与 cooldown（冷却）目前仅保留配置，尚不执行跨轮计时。</p>
        <ul v-if="diagnostics" aria-label="条目扫描诊断">
          <li v-for="decision in diagnostics.decisions" :key="decision.entryId">
            {{ decision.entryId }}：{{ reasonLabels[decision.reason] ?? decision.reason }}
            <span v-if="decision.unsupported?.length">；暂不支持：{{ decision.unsupported.join('、') }}</span>
          </li>
        </ul>
        <div class="results-header">
          <h3>Scan Results</h3>
          <el-tag v-if="matchedEntries.length > 0" type="success">
            {{ matchedEntries.length }} entries matched
          </el-tag>
          <el-tag v-else type="info">No matches</el-tag>
          <el-tag type="warning">{{ diagnostics?.budgetUsed ?? totalTokens }} / {{ diagnostics?.budgetLimit ?? "—" }} 估算 tokens</el-tag>
        </div>

        <el-empty v-if="matchedEntries.length === 0 && testText" description="No World Info entries matched" />

        <div v-else-if="matchedEntries.length > 0" class="matched-entries">
          <div
            v-for="entry in matchedEntries"
            :key="entry.id"
            class="matched-entry"
          >
            <div class="entry-header">
              <div class="entry-title">
                <el-tag :type="getDepthTagType(entry.depth)" size="small">
                  Depth {{ entry.depth }}
                </el-tag>
                <el-tag :type="getRecursionDepthTagType(entry.recursionDepth)" size="small">
                  Recursion {{ entry.recursionDepth }}
                </el-tag>
                <el-tag v-if="entry.constant" type="danger" size="small">Constant</el-tag>
                <el-tag type="info" size="small">{{ entry.tokens }} tokens</el-tag>
                <span class="entry-name">{{ entry.comment || 'Unnamed Entry' }}</span>
              </div>
              <el-button
                text
                size="small"
                @click="toggleEntryExpand(entry.id)"
              >
                <el-icon>
                  <component :is="expandedEntries.has(entry.id) ? ArrowUp : ArrowDown" />
                </el-icon>
              </el-button>
            </div>

            <div class="entry-matches">
              <span class="match-label">Matched keys:</span>
              <el-tag
                v-for="key in entry.matchedKeys"
                :key="key"
                size="small"
                class="matched-key"
              >
                {{ key }}
              </el-tag>
            </div>

            <el-collapse-transition>
              <div v-if="expandedEntries.has(entry.id)" class="entry-content">
                <div class="content-section">
                  <div class="section-label">Content:</div>
                  <pre class="content-text">{{ entry.content }}</pre>
                </div>

                <div v-if="entry.keys.length > 0" class="content-section">
                  <div class="section-label">All Keys:</div>
                  <div class="keys-list">
                    <el-tag
                      v-for="key in entry.keys"
                      :key="key"
                      size="small"
                      :type="entry.matchedKeys.includes(key) ? 'success' : ''"
                    >
                      {{ key }}
                    </el-tag>
                  </div>
                </div>

                <div v-if="entry.secondaryKeys && entry.secondaryKeys.length > 0" class="content-section">
                  <div class="section-label">Secondary Keys:</div>
                  <div class="keys-list">
                    <el-tag
                      v-for="key in entry.secondaryKeys"
                      :key="key"
                      size="small"
                      type="warning"
                    >
                      {{ key }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </el-collapse-transition>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">Close</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Search,
  FullScreen,
  Close,
  ArrowUp,
  ArrowDown,
} from '@element-plus/icons-vue';
import { worldbookApi, type ScanResult } from '@client/services/worldbook.api';

interface WorldBookEntry {
  id: string;
  keys: string[];
  secondaryKeys?: string[];
  content: string;
  comment?: string;
  depth: number;
  constant: boolean;
}

interface MatchedEntry extends WorldBookEntry {
  matchedKeys: string[];
  tokens: number;
  recursionDepth: number;
}

const props = defineProps<{
  worldBookId: string;
}>();

const visible = defineModel<boolean>({ required: true });

const testText = ref('');
const scanning = ref(false);
const isFullscreen = ref(false);
const matchedEntries = ref<MatchedEntry[]>([]);
const diagnostics = ref<ScanResult['diagnostics']>();
const scanNote = ref('');
const reasonLabels: Record<string, string> = {
  included_in_prompt: '本次预览注入', keyword_not_matched: '未满足关键词或扫描深度条件',
  disabled: '已停用', probability_check_failed: '概率未通过', delay_not_reached: '未达到延迟消息数',
  token_budget_exceeded: '超出世界书预算', character_filter: '角色筛选不匹配', recursion_disabled: '禁止递归触发',
};
const expandedEntries = ref<Set<string>>(new Set());

const totalTokens = computed(() => {
  return matchedEntries.value.reduce((sum, entry) => sum + entry.tokens, 0);
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let scanVersion = 0;
function invalidateScan() {
  scanVersion++;
  if (debounceTimer) clearTimeout(debounceTimer);
  scanning.value = false;
  matchedEntries.value = [];
  diagnostics.value = undefined;
  scanNote.value = '';
}
watch([testText, () => props.worldBookId, visible], invalidateScan, { flush: 'sync' });
onBeforeUnmount(invalidateScan);

function debouncedScan() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    if (testText.value.trim()) {
      scanEntries();
    }
  }, 500);
}

async function scanEntries() {
  if (!testText.value.trim()) {
    matchedEntries.value = [];
    diagnostics.value = undefined;
    scanNote.value = '';
    return;
  }

  const version = ++scanVersion;
  scanning.value = true;
  try {
    const response = await worldbookApi.scanEntries(props.worldBookId, testText.value);
    if (version !== scanVersion) return;
    matchedEntries.value = response.matches;
    diagnostics.value = response.diagnostics;
    scanNote.value = response.note ?? '';
  } catch (error) {
    if (version !== scanVersion) return;
    matchedEntries.value = [];
    diagnostics.value = undefined;
    scanNote.value = '';
    ElMessage.error(error instanceof Error ? error.message : '扫描失败');
    console.error(error);
  } finally {
    if (version === scanVersion) scanning.value = false;
  }
}

function toggleEntryExpand(entryId: string) {
  if (expandedEntries.value.has(entryId)) {
    expandedEntries.value.delete(entryId);
  } else {
    expandedEntries.value.add(entryId);
  }
}

function getDepthTagType(depth: number) {
  if (depth === 0) return 'danger';
  if (depth <= 2) return 'warning';
  return 'info';
}

function getRecursionDepthTagType(recursionDepth: number) {
  if (recursionDepth === 0) return 'success'; // Direct match
  if (recursionDepth === 1) return 'warning'; // First level recursion
  return 'danger'; // Deep recursion
}
</script>

<style scoped lang="scss">
.worldbook-tester {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 70vh;
  min-height: 500px;

  .tester-input {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .input-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
  }

  .scan-results {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    .results-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--el-border-color-light);

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
    }

    .matched-entries {
      flex: 1;
      overflow-y: auto;
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;

      .matched-entry {
        border: 1px solid var(--el-border-color-light);
        border-radius: 8px;
        padding: 16px;
        background: var(--el-fill-color-blank);
        transition: all 0.3s;

        &:hover {
          border-color: var(--el-color-primary);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .entry-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;

          .entry-title {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;

            .entry-name {
              font-weight: 500;
              color: var(--el-text-color-primary);
            }
          }
        }

        .entry-matches {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;

          .match-label {
            font-size: 13px;
            color: var(--el-text-color-secondary);
          }

          .matched-key {
            background: var(--el-color-success-light-9);
            border-color: var(--el-color-success);
          }
        }

        .entry-content {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--el-border-color-lighter);

          .content-section {
            margin-bottom: 16px;

            &:last-child {
              margin-bottom: 0;
            }

            .section-label {
              font-size: 13px;
              font-weight: 600;
              color: var(--el-text-color-secondary);
              margin-bottom: 8px;
            }

            .content-text {
              margin: 0;
              padding: 12px;
              background: var(--el-fill-color-light);
              border-radius: 4px;
              font-family: 'Consolas', 'Monaco', monospace;
              font-size: 13px;
              line-height: 1.6;
              white-space: pre-wrap;
              word-wrap: break-word;
            }

            .keys-list {
              display: flex;
              flex-wrap: wrap;
              gap: 6px;
            }
          }
        }
      }
    }
  }
}
</style>

<style>
.worldbook-tester-dialog {
  .el-dialog__body {
    padding: 20px !important;
  }
}
</style>
