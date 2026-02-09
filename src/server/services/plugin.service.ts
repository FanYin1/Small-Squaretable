/**
 * Plugin Service
 *
 * Business logic for plugin lifecycle management: CRUD, install/uninstall,
 * marketplace listing, and event execution pipeline.
 */

import type { PluginRepository } from '../../db/repositories/plugin.repository';
import type { PluginSandbox } from './plugin-sandbox';
import type { EventBus } from './event-bus.service';
import type {
  CreatePluginInput,
  UpdatePluginInput,
  PluginInfo,
  PluginInstallInfo,
  PluginExecutionResult,
  PluginMarketplaceQuery,
} from '../../types/plugin';
import { ValidationError, NotFoundError } from '../../core/errors';

const MAX_INSTALLS_PER_USER = 20;

export class PluginService {
  constructor(
    private pluginRepo: PluginRepository,
    private pluginSandbox: PluginSandbox,
    private eventBus: EventBus,
  ) {}

  async createPlugin(authorId: string, input: CreatePluginInput): Promise<PluginInfo> {
    const existing = await this.pluginRepo.findBySlug(input.slug);
    if (existing) throw new ValidationError('Plugin slug already exists');
    const plugin = await this.pluginRepo.createPlugin({ ...input, authorId });
    return this.toPluginInfo(plugin);
  }

  async updatePlugin(id: string, authorId: string, input: UpdatePluginInput): Promise<PluginInfo> {
    const plugin = await this.pluginRepo.updatePlugin(id, authorId, input);
    if (!plugin) throw new NotFoundError('Plugin');
    return this.toPluginInfo(plugin);
  }

  async deletePlugin(id: string, authorId: string): Promise<void> {
    const deleted = await this.pluginRepo.deletePlugin(id, authorId);
    if (!deleted) throw new NotFoundError('Plugin');
  }
  async publishPlugin(id: string, authorId: string): Promise<PluginInfo> {
    return this.updatePlugin(id, authorId, { isPublished: true });
  }

  async getMyPlugins(authorId: string): Promise<PluginInfo[]> {
    const plugins = await this.pluginRepo.findByAuthorId(authorId);
    return plugins.map((p) => this.toPluginInfo(p));
  }

  async listPublished(query: PluginMarketplaceQuery): Promise<{ items: PluginInfo[]; total: number }> {
    const offset = (query.page - 1) * query.limit;
    const [plugins, total] = await Promise.all([
      this.pluginRepo.findPublished({ limit: query.limit, offset, sort: query.sort }),
      this.pluginRepo.countPublished(),
    ]);
    return { items: plugins.map((p) => this.toPluginInfo(p)), total };
  }

  async searchPlugins(q: string, limit: number, offset: number): Promise<PluginInfo[]> {
    const plugins = await this.pluginRepo.searchPlugins(q, limit, offset);
    return plugins.map((p) => this.toPluginInfo(p));
  }

  async getPlugin(id: string): Promise<PluginInfo> {
    const plugin = await this.pluginRepo.findById(id);
    if (!plugin) throw new NotFoundError('Plugin');
    return this.toPluginInfo(plugin);
  }

  async installPlugin(
    userId: string,
    pluginId: string,
    config: Record<string, unknown> = {},
    planLimit?: number,
  ): Promise<PluginInstallInfo> {
    const maxInstalls = planLimit ?? MAX_INSTALLS_PER_USER;
    const existing = await this.pluginRepo.findInstallsByUserId(userId);
    if (existing.length >= maxInstalls) {
      throw new ValidationError(`Maximum ${maxInstalls} plugins allowed`);
    }
    const alreadyInstalled = await this.pluginRepo.findInstallByUserAndPlugin(userId, pluginId);
    if (alreadyInstalled) throw new ValidationError('Plugin already installed');
    const plugin = await this.pluginRepo.findById(pluginId);
    if (!plugin || !plugin.isPublished) throw new NotFoundError('Plugin');
    const install = await this.pluginRepo.createInstall({ userId, pluginId, config });
    await this.pluginRepo.incrementInstallCount(pluginId);
    try {
      await this.pluginSandbox.loadPlugin(pluginId, userId, plugin.sourceCode, config);
    } catch {
      // Sandbox load failure is non-fatal for install
    }
    return { ...install, plugin: this.toPluginInfo(plugin) } as unknown as PluginInstallInfo;
  }

  async uninstallPlugin(installId: string, userId: string): Promise<void> {
    const installs = await this.pluginRepo.findInstallsByUserId(userId);
    const install = installs.find((i: any) => i.id === installId);
    if (!install) throw new NotFoundError('Install');
    await this.pluginSandbox.unloadPlugin(`${(install as any).pluginId}:${userId}`);
    await this.pluginRepo.deleteInstall(installId, userId);
    await this.pluginRepo.decrementInstallCount((install as any).pluginId);
  }

  async getUserInstalls(userId: string): Promise<PluginInstallInfo[]> {
    const installs = await this.pluginRepo.findInstallsByUserId(userId);
    return installs as unknown as PluginInstallInfo[];
  }

  async updateInstallConfig(
    installId: string,
    userId: string,
    data: { isEnabled?: boolean; config?: Record<string, unknown> },
  ): Promise<PluginInstallInfo> {
    const install = await this.pluginRepo.updateInstall(installId, userId, data);
    if (!install) throw new NotFoundError('Install');
    return install as unknown as PluginInstallInfo;
  }

  async enablePlugin(installId: string, userId: string): Promise<PluginInstallInfo> {
    return this.updateInstallConfig(installId, userId, { isEnabled: true });
  }

  async disablePlugin(installId: string, userId: string): Promise<PluginInstallInfo> {
    return this.updateInstallConfig(installId, userId, { isEnabled: false });
  }

  async executeEvent(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<PluginExecutionResult[]> {
    const installs = await this.pluginRepo.findEnabledInstallsByEvent(userId, event);
    if (installs.length === 0) return [];
    const results: PluginExecutionResult[] = [];
    for (const install of installs) {
      const workerId = `${(install as any).pluginId}:${userId}`;
      const result = await this.pluginSandbox.sendEvent(workerId, event, payload);
      results.push(result);
      if (event === 'chat.message.before' && result.success && result.output) {
        payload = result.output;
      }
    }
    return results;
  }

  private toPluginInfo(plugin: any): PluginInfo {
    return {
      id: plugin.id,
      slug: plugin.slug,
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      authorId: plugin.authorId,
      events: plugin.events,
      permissions: plugin.permissions,
      configSchema: plugin.configSchema as Record<string, unknown>,
      isPublished: plugin.isPublished,
      isOfficial: plugin.isOfficial,
      installCount: plugin.installCount,
      iconUrl: plugin.iconUrl,
      readme: plugin.readme,
      createdAt: plugin.createdAt?.toISOString?.() ?? plugin.createdAt,
    };
  }
}

import { pluginRepository } from '../../db/repositories/plugin.repository';
import { pluginSandbox } from './plugin-sandbox';
import { eventBus } from './event-bus.service';
export const pluginService = new PluginService(pluginRepository, pluginSandbox, eventBus);
