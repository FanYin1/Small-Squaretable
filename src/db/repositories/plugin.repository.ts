/**
 * Plugin Repository
 *
 * Handles data access for plugin CRUD, install management, and KV store operations.
 */

import { eq, and, desc, asc, sql, ilike, or } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import {
  plugins,
  pluginInstalls,
  pluginKvStore,
  type Plugin,
  type NewPlugin,
  type PluginInstall,
  type NewPluginInstall,
} from '../schema/plugins';
import { db } from '../index';

export class PluginRepository extends BaseRepository {
  // =====================
  // Plugin CRUD
  // =====================

  /**
   * Create a new plugin record.
   */
  async createPlugin(data: NewPlugin): Promise<Plugin> {
    const [plugin] = await this.db.insert(plugins).values(data).returning();
    return plugin;
  }

  /**
   * Find a plugin by its UUID.
   */
  async findById(id: string): Promise<Plugin | null> {
    const [plugin] = await this.db
      .select()
      .from(plugins)
      .where(eq(plugins.id, id))
      .limit(1);
    return plugin || null;
  }

  /**
   * Find a plugin by its unique slug.
   */
  async findBySlug(slug: string): Promise<Plugin | null> {
    const [plugin] = await this.db
      .select()
      .from(plugins)
      .where(eq(plugins.slug, slug))
      .limit(1);
    return plugin || null;
  }

  /**
   * Find all plugins by author ID.
   */
  async findByAuthorId(authorId: string): Promise<Plugin[]> {
    return this.db
      .select()
      .from(plugins)
      .where(eq(plugins.authorId, authorId))
      .orderBy(desc(plugins.createdAt));
  }

  /**
   * Find published plugins with pagination and sorting.
   * Sort by: 'popular' = installCount desc, 'newest' = createdAt desc, 'name' = name asc
   */
  async findPublished(options: { limit: number; offset: number; sort: string }): Promise<Plugin[]> {
    const { limit, offset, sort } = options;

    let orderByClause;
    switch (sort) {
      case 'newest':
        orderByClause = desc(plugins.createdAt);
        break;
      case 'name':
        orderByClause = asc(plugins.name);
        break;
      case 'popular':
      default:
        orderByClause = desc(plugins.installCount);
        break;
    }

    return this.db
      .select()
      .from(plugins)
      .where(eq(plugins.isPublished, true))
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Search published plugins by name or description using ILIKE.
   */
  async searchPlugins(query: string, limit: number, offset: number): Promise<Plugin[]> {
    const pattern = `%${query}%`;
    return this.db
      .select()
      .from(plugins)
      .where(
        and(
          eq(plugins.isPublished, true),
          or(ilike(plugins.name, pattern), ilike(plugins.description, pattern)),
        ),
      )
      .limit(limit)
      .offset(offset);
  }

  /**
   * Count total published plugins.
   */
  async countPublished(): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(plugins)
      .where(eq(plugins.isPublished, true));
    return result?.count || 0;
  }

  /**
   * Update a plugin with ownership check (id + authorId).
   * Returns the updated record or null if not found / not owned.
   */
  async updatePlugin(id: string, authorId: string, data: Partial<Plugin>): Promise<Plugin | null> {
    const [updated] = await this.db
      .update(plugins)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(plugins.id, id), eq(plugins.authorId, authorId)))
      .returning();
    return updated || null;
  }

  /**
   * Delete a plugin with ownership check.
   * Returns true if deleted, false if not found / not owned.
   */
  async deletePlugin(id: string, authorId: string): Promise<boolean> {
    const result = await this.db
      .delete(plugins)
      .where(and(eq(plugins.id, id), eq(plugins.authorId, authorId)))
      .returning({ id: plugins.id });
    return result.length > 0;
  }

  /**
   * Increment the install_count for a plugin.
   */
  async incrementInstallCount(pluginId: string): Promise<void> {
    await this.db
      .update(plugins)
      .set({
        installCount: sql`${plugins.installCount} + 1`,
      })
      .where(eq(plugins.id, pluginId));
  }

  /**
   * Decrement the install_count for a plugin (minimum 0).
   */
  async decrementInstallCount(pluginId: string): Promise<void> {
    await this.db
      .update(plugins)
      .set({
        installCount: sql`GREATEST(${plugins.installCount} - 1, 0)`,
      })
      .where(eq(plugins.id, pluginId));
  }

  // =====================
  // Install CRUD
  // =====================

  /**
   * Create a new plugin install record.
   */
  async createInstall(data: NewPluginInstall): Promise<PluginInstall> {
    const [install] = await this.db.insert(pluginInstalls).values(data).returning();
    return install;
  }

  /**
   * Find all installs for a user, joined with plugin data.
   */
  async findInstallsByUserId(userId: string): Promise<(PluginInstall & { plugin: Plugin })[]> {
    return this.db
      .select()
      .from(pluginInstalls)
      .innerJoin(plugins, eq(pluginInstalls.pluginId, plugins.id))
      .where(eq(pluginInstalls.userId, userId)) as any;
  }

  /**
   * Find a specific install by user and plugin.
   */
  async findInstallByUserAndPlugin(userId: string, pluginId: string): Promise<PluginInstall | null> {
    const [install] = await this.db
      .select()
      .from(pluginInstalls)
      .where(and(eq(pluginInstalls.userId, userId), eq(pluginInstalls.pluginId, pluginId)))
      .limit(1);
    return install || null;
  }

  /**
   * Find enabled installs for a user where the plugin subscribes to a specific event.
   * Uses PostgreSQL array contains operator (@>) to check if the event is in the plugin's events array.
   */
  async findEnabledInstallsByEvent(userId: string, event: string): Promise<(PluginInstall & { plugin: Plugin })[]> {
    return this.db
      .select()
      .from(pluginInstalls)
      .innerJoin(plugins, eq(pluginInstalls.pluginId, plugins.id))
      .where(
        and(
          eq(pluginInstalls.userId, userId),
          eq(pluginInstalls.isEnabled, true),
          sql`${plugins.events}::text[] @> ARRAY[${event}]::text[]`,
        ),
      ) as any;
  }

  /**
   * Update an install with ownership check (id + userId).
   * Returns the updated record or null if not found / not owned.
   */
  async updateInstall(id: string, userId: string, data: Partial<PluginInstall>): Promise<PluginInstall | null> {
    const [updated] = await this.db
      .update(pluginInstalls)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(pluginInstalls.id, id), eq(pluginInstalls.userId, userId)))
      .returning();
    return updated || null;
  }

  /**
   * Delete an install with ownership check.
   * Returns true if deleted, false if not found / not owned.
   */
  async deleteInstall(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(pluginInstalls)
      .where(and(eq(pluginInstalls.id, id), eq(pluginInstalls.userId, userId)))
      .returning({ id: pluginInstalls.id });
    return result.length > 0;
  }

  // =====================
  // KV Store
  // =====================

  /**
   * Get a value from the KV store by composite key (pluginId + userId + key).
   */
  async kvGet(pluginId: string, userId: string, key: string): Promise<unknown | null> {
    const [record] = await this.db
      .select()
      .from(pluginKvStore)
      .where(
        and(
          eq(pluginKvStore.pluginId, pluginId),
          eq(pluginKvStore.userId, userId),
          eq(pluginKvStore.key, key),
        ),
      )
      .limit(1);
    return record?.value ?? null;
  }

  /**
   * Upsert a value in the KV store using onConflictDoUpdate on the unique index.
   */
  async kvSet(pluginId: string, userId: string, key: string, value: unknown): Promise<void> {
    await this.db
      .insert(pluginKvStore)
      .values({ pluginId, userId, key, value })
      .onConflictDoUpdate({
        target: [pluginKvStore.pluginId, pluginKvStore.userId, pluginKvStore.key],
        set: { value, updatedAt: new Date() },
      });
  }

  /**
   * Delete a KV entry by composite key.
   * Returns true if deleted, false if not found.
   */
  async kvDelete(pluginId: string, userId: string, key: string): Promise<boolean> {
    const result = await this.db
      .delete(pluginKvStore)
      .where(
        and(
          eq(pluginKvStore.pluginId, pluginId),
          eq(pluginKvStore.userId, userId),
          eq(pluginKvStore.key, key),
        ),
      )
      .returning({ id: pluginKvStore.id });
    return result.length > 0;
  }
}

export const pluginRepository = new PluginRepository(db);
