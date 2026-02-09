<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Download, Setting, Delete } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePluginStore } from '@client/stores/plugin';
import DashboardLayout from '@client/components/layout/DashboardLayout.vue';
import type { PluginInfo, PluginInstallInfo } from '@/types/plugin';

const { t } = useI18n();
const pluginStore = usePluginStore();

const activeTab = ref('marketplace');
const searchInput = ref('');
const configDialogVisible = ref(false);
const configPlugin = ref<PluginInstallInfo | null>(null);
const configForm = ref<Record<string, unknown>>({});

// --- Computed ---
const isInstalled = (pluginId: string) => pluginStore.installedPluginIds.has(pluginId);

const configFields = computed(() => {
  if (!configPlugin.value?.plugin.configSchema) return [];
  const schema = configPlugin.value.plugin.configSchema as Record<string, Record<string, unknown>>;
  return Object.entries(schema).map(([key, def]) => ({
    key,
    label: (def.title as string) || key,
    type: (def.type as string) || 'string',
    description: (def.description as string) || '',
  }));
});

// --- Actions ---
async function handleSearch() {
  await pluginStore.searchPlugins(searchInput.value);
}

function handleSortChange(sort: 'popular' | 'newest' | 'name') {
  pluginStore.currentSort = sort;
  pluginStore.fetchMarketplace(1);
}

async function handlePageChange(page: number) {
  await pluginStore.fetchMarketplace(page);
}

async function handleInstall(plugin: PluginInfo) {
  const ok = await pluginStore.installPlugin(plugin.id);
  if (ok) {
    ElMessage.success(t('plugins.installSuccess'));
  } else {
    ElMessage.error(t('plugins.installFailed'));
  }
}
async function handleUninstall(install: PluginInstallInfo) {
  try {
    await ElMessageBox.confirm(
      t('plugins.uninstallConfirm', { name: install.plugin.name }),
      t('common.confirm'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
    const ok = await pluginStore.uninstallPlugin(install.id);
    if (ok) {
      ElMessage.success(t('plugins.uninstallSuccess'));
    } else {
      ElMessage.error(t('plugins.uninstallFailed'));
    }
  } catch {
    // cancelled
  }
}

async function handleToggle(install: PluginInstallInfo, enabled: boolean) {
  await pluginStore.toggleEnabled(install.id, enabled);
}

function openConfigDialog(install: PluginInstallInfo) {
  configPlugin.value = install;
  configForm.value = { ...install.config };
  configDialogVisible.value = true;
}

async function handleSaveConfig() {
  if (!configPlugin.value) return;
  const ok = await pluginStore.updateConfig(configPlugin.value.id, { config: configForm.value });
  if (ok) {
    ElMessage.success(t('plugins.configSaved'));
    configDialogVisible.value = false;
  } else {
    ElMessage.error(t('plugins.configFailed'));
  }
}

onMounted(() => {
  pluginStore.fetchMarketplace(1);
  pluginStore.fetchInstalled();
});
</script>
<template>
  <DashboardLayout>
    <template #title>{{ t('plugins.title') }}</template>
    <template #actions>
      <el-input
        v-if="activeTab === 'marketplace'"
        v-model="searchInput"
        :placeholder="t('plugins.searchPlaceholder')"
        :prefix-icon="Search"
        clearable
        style="width: 260px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
    </template>

    <div class="plugin-marketplace">
      <el-tabs v-model="activeTab">
        <el-tab-pane :label="t('plugins.marketplace')" name="marketplace">
          <!-- Sort controls -->
          <div class="sort-bar">
            <el-radio-group :model-value="pluginStore.currentSort" size="small" @change="handleSortChange">
              <el-radio-button value="popular">{{ t('plugins.sortPopular') }}</el-radio-button>
              <el-radio-button value="newest">{{ t('plugins.sortNewest') }}</el-radio-button>
              <el-radio-button value="name">{{ t('plugins.sortName') }}</el-radio-button>
            </el-radio-group>
          </div>

          <!-- Plugin grid -->
          <div v-loading="pluginStore.marketplaceLoading" class="plugin-grid">
            <div v-for="plugin in pluginStore.marketplacePlugins" :key="plugin.id" class="plugin-card">
              <div class="plugin-card-header">
                <el-avatar v-if="plugin.iconUrl" :src="plugin.iconUrl" :size="48" shape="square" />
                <el-avatar v-else :size="48" shape="square" class="plugin-avatar-fallback">
                  {{ plugin.name[0] }}
                </el-avatar>
                <div class="plugin-info">
                  <h3 class="plugin-name">{{ plugin.name }}</h3>
                  <span class="plugin-author">{{ plugin.authorName || 'Unknown' }}</span>
                </div>
              </div>
              <p class="plugin-description">{{ plugin.description || '' }}</p>
              <div class="plugin-card-footer">
                <span class="plugin-installs">
                  <el-icon><Download /></el-icon>
                  {{ t('plugins.installCount', { count: plugin.installCount }) }}
                </span>
                <el-button
                  v-if="isInstalled(plugin.id)"
                  size="small"
                  disabled
                >{{ t('plugins.installed') }}</el-button>
                <el-button
                  v-else
                  type="primary"
                  size="small"
                  @click="handleInstall(plugin)"
                >{{ t('plugins.install') }}</el-button>
              </div>
            </div>
          </div>
          <!-- Pagination -->
          <div v-if="pluginStore.pagination.totalPages > 1" class="pagination-wrapper">
            <el-pagination
              :current-page="pluginStore.pagination.page"
              :page-size="pluginStore.pagination.limit"
              :total="pluginStore.pagination.total"
              layout="prev, pager, next"
              @current-change="handlePageChange"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane :label="t('plugins.myPlugins')" name="installed">
          <div v-loading="pluginStore.loading" class="installed-list">
            <!-- Empty state -->
            <div v-if="!pluginStore.loading && pluginStore.installedPlugins.length === 0" class="empty-state">
              <el-icon :size="64" color="var(--text-tertiary)"><Download /></el-icon>
              <p>{{ t('plugins.noInstalled') }}</p>
            </div>

            <!-- Installed plugin cards -->
            <div v-for="install in pluginStore.installedPlugins" :key="install.id" class="installed-card">
              <div class="installed-card-left">
                <el-avatar v-if="install.plugin.iconUrl" :src="install.plugin.iconUrl" :size="40" shape="square" />
                <el-avatar v-else :size="40" shape="square" class="plugin-avatar-fallback">
                  {{ install.plugin.name[0] }}
                </el-avatar>
                <div class="installed-info">
                  <h4 class="installed-name">{{ install.plugin.name }}</h4>
                  <span class="installed-version">v{{ install.plugin.version }}</span>
                </div>
              </div>
              <div class="installed-card-actions">
                <el-switch
                  :model-value="install.isEnabled"
                  :title="t('plugins.toggleEnabled')"
                  @change="(val: boolean) => handleToggle(install, val)"
                />
                <el-button text :icon="Setting" @click="openConfigDialog(install)">
                  {{ t('plugins.configure') }}
                </el-button>
                <el-button text type="danger" :icon="Delete" @click="handleUninstall(install)">
                  {{ t('plugins.uninstall') }}
                </el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- Config Dialog -->
    <el-dialog
      v-model="configDialogVisible"
      :title="t('plugins.configTitle', { name: configPlugin?.plugin.name || '' })"
      width="520px"
    >
      <el-form v-if="configFields.length > 0" label-position="top">
        <el-form-item v-for="field in configFields" :key="field.key" :label="field.label">
          <template v-if="field.type === 'boolean'">
            <el-switch v-model="(configForm[field.key] as boolean)" />
          </template>
          <template v-else-if="field.type === 'number'">
            <el-input-number v-model="(configForm[field.key] as number)" />
          </template>
          <template v-else>
            <el-input v-model="(configForm[field.key] as string)" />
          </template>
          <div v-if="field.description" class="field-description">{{ field.description }}</div>
        </el-form-item>
      </el-form>
      <div v-else class="empty-config">
        <p>{{ t('plugins.noInstalled') }}</p>
      </div>
      <template #footer>
        <el-button @click="configDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSaveConfig">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </DashboardLayout>
</template>
<style scoped>
.plugin-marketplace {
  max-width: 1200px;
  margin: 0 auto;
  animation: fadeIn var(--duration-slow) var(--ease-out) both;
}

.sort-bar {
  margin-bottom: 20px;
}

.plugin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  min-height: 200px;
}

.plugin-card {
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  padding: 20px;
  border: 1px solid var(--border-default);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text-primary) 8%, transparent);
  transition: border-color var(--duration-normal);
  display: flex;
  flex-direction: column;
}

.plugin-card:hover {
  border-color: var(--accent-purple);
}

.plugin-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.plugin-avatar-fallback {
  background: var(--accent-gradient);
  color: #fff;
  font-weight: 700;
  font-size: 18px;
}

.plugin-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.plugin-name {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plugin-author {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.plugin-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0 0 16px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.plugin-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--border-default);
}

.plugin-installs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

/* Installed plugins */
.installed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}

.installed-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  border: 1px solid var(--border-default);
  transition: border-color var(--duration-normal);
}

.installed-card:hover {
  border-color: var(--accent-purple);
}

.installed-card-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.installed-info {
  display: flex;
  flex-direction: column;
}

.installed-name {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.installed-version {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.installed-card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-state p {
  margin: 16px 0 0;
  font-size: var(--font-size-base);
  color: var(--text-secondary);
}

.empty-config p {
  text-align: center;
  color: var(--text-secondary);
}

.field-description {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-top: 4px;
}

/* Mobile */
@media (max-width: 767px) {
  .plugin-grid {
    grid-template-columns: 1fr;
  }

  .installed-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .installed-card-actions {
    flex-wrap: wrap;
  }
}
</style>
