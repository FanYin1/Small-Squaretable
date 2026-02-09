/**
 * Plugin Store
 *
 * Manages plugin marketplace browsing and installed plugin state
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { pluginApi } from '../services/plugin.api';
import type { PaginatedPlugins } from '../services/plugin.api';
import type { PluginInfo, PluginInstallInfo, UpdateInstallConfigInput } from '@/types/plugin';
import { createLogger } from '@client/utils/logger';

const logger = createLogger('PluginStore');

export const usePluginStore = defineStore('plugin', () => {
  // --- State ---
  const installedPlugins = ref<PluginInstallInfo[]>([]);
  const marketplacePlugins = ref<PluginInfo[]>([]);
  const loading = ref(false);
  const marketplaceLoading = ref(false);
  const searchQuery = ref('');
  const currentSort = ref<'popular' | 'newest' | 'name'>('popular');
  const pagination = ref({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const error = ref<string | null>(null);

  // --- Computed ---
  const enabledPlugins = computed(() =>
    installedPlugins.value.filter((p) => p.isEnabled),
  );

  const installedPluginIds = computed(() =>
    new Set(installedPlugins.value.map((p) => p.pluginId)),
  );

  // --- Actions ---

  async function fetchInstalled(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      installedPlugins.value = await pluginApi.getInstalls();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch installed plugins';
      error.value = message;
      logger.error('Failed to fetch installed plugins', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchMarketplace(page = 1): Promise<void> {
    marketplaceLoading.value = true;
    error.value = null;
    try {
      const data: PaginatedPlugins = await pluginApi.getMarketplace({
        search: searchQuery.value || undefined,
        page,
        limit: pagination.value.limit,
        sort: currentSort.value,
      });
      marketplacePlugins.value = data.items;
      pagination.value = data.pagination;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch marketplace';
      error.value = message;
      logger.error('Failed to fetch marketplace', err);
    } finally {
      marketplaceLoading.value = false;
    }
  }

  async function searchPlugins(query: string): Promise<void> {
    searchQuery.value = query;
    await fetchMarketplace(1);
  }

  async function installPlugin(pluginId: string, config: Record<string, unknown> = {}): Promise<boolean> {
    try {
      const install = await pluginApi.installPlugin(pluginId, config);
      installedPlugins.value.push(install);
      const mp = marketplacePlugins.value.find((p) => p.id === pluginId);
      if (mp) mp.installCount++;
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to install plugin';
      error.value = message;
      logger.error('Failed to install plugin', err);
      return false;
    }
  }

  async function uninstallPlugin(installId: string): Promise<boolean> {
    try {
      const install = installedPlugins.value.find((p) => p.id === installId);
      await pluginApi.uninstallPlugin(installId);
      installedPlugins.value = installedPlugins.value.filter((p) => p.id !== installId);
      if (install) {
        const mp = marketplacePlugins.value.find((p) => p.id === install.pluginId);
        if (mp && mp.installCount > 0) mp.installCount--;
      }
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to uninstall plugin';
      error.value = message;
      logger.error('Failed to uninstall plugin', err);
      return false;
    }
  }

  async function updateConfig(installId: string, input: UpdateInstallConfigInput): Promise<boolean> {
    try {
      const updated = await pluginApi.updateInstallConfig(installId, input);
      const idx = installedPlugins.value.findIndex((p) => p.id === installId);
      if (idx !== -1) installedPlugins.value[idx] = updated;
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update config';
      error.value = message;
      logger.error('Failed to update plugin config', err);
      return false;
    }
  }

  async function toggleEnabled(installId: string, enabled: boolean): Promise<boolean> {
    try {
      const updated = enabled
        ? await pluginApi.enablePlugin(installId)
        : await pluginApi.disablePlugin(installId);
      const idx = installedPlugins.value.findIndex((p) => p.id === installId);
      if (idx !== -1) installedPlugins.value[idx] = updated;
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle plugin';
      error.value = message;
      logger.error('Failed to toggle plugin', err);
      return false;
    }
  }

  return {
    installedPlugins, marketplacePlugins, loading, marketplaceLoading,
    searchQuery, currentSort, pagination, error,
    enabledPlugins, installedPluginIds,
    fetchInstalled, fetchMarketplace, searchPlugins,
    installPlugin, uninstallPlugin, updateConfig, toggleEnabled,
  };
});
