/**
 * Audit Log Repository
 *
 * Data access layer for audit log entries.
 */

import { eq, and, sql, desc, gte, lte, lt } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { auditLogs, type AuditLog, type NewAuditLog } from '../schema/audit-logs';
import type { PaginatedResponse } from '../../types/api';

export interface AuditLogFilters {
  actorId?: string;
  action?: string;
  targetType?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface AuditPaginationParams {
  page?: number;
  limit?: number;
}

export class AuditRepository extends BaseRepository {
  async create(data: NewAuditLog): Promise<AuditLog> {
    const result = await this.db.insert(auditLogs).values(data).returning();
    return result[0];
  }

  async findByTenant(
    tenantId: string,
    filters?: AuditLogFilters,
    pagination?: AuditPaginationParams,
  ): Promise<PaginatedResponse<AuditLog>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [eq(auditLogs.tenantId, tenantId)];

    if (filters?.actorId) {
      conditions.push(eq(auditLogs.actorId, filters.actorId));
    }
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters?.targetType) {
      conditions.push(eq(auditLogs.targetType, filters.targetType));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(auditLogs.createdAt, filters.dateFrom));
    }
    if (filters?.dateTo) {
      conditions.push(lte(auditLogs.createdAt, filters.dateTo));
    }

    const where = and(...conditions);

    const [items, [{ count }]] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(where),
    ]);

    const total = count;
    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async deleteOlderThan(tenantId: string, date: Date): Promise<number> {
    const result = await this.db
      .delete(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), lt(auditLogs.createdAt, date)))
      .returning();
    return result.length;
  }
}

export const auditRepository = new AuditRepository(db);
