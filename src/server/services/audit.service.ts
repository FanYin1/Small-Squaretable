/**
 * Audit Service
 *
 * Provides fire-and-forget audit logging. Never throws, never blocks the caller.
 */

import crypto from 'crypto';
import { auditRepository } from '../../db/repositories/audit.repository';
import { logger } from './logger.service';

const auditLogger = logger.child({ module: 'audit' });
import type { AuditLogFilters, AuditPaginationParams } from '../../db/repositories/audit.repository';
import type { PaginatedResponse } from '../../types/api';
import type { AuditLog } from '../../db/schema/audit-logs';

export interface AuditEvent {
  tenantId: string;
  actorId: string;
  actorIp?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export const auditService = {
  /**
   * Log an audit event. Fire-and-forget — never throws, never blocks the request.
   */
  log(event: AuditEvent): void {
    const hashedIp = event.actorIp
      ? crypto.createHash('sha256').update(event.actorIp).digest('hex').slice(0, 16)
      : null;

    // Fire-and-forget: don't await, catch errors silently
    auditRepository.create({
      ...event,
      actorIp: hashedIp,
      metadata: event.metadata ?? {},
    }).catch((err) => {
      auditLogger.error('Failed to write audit log', err as Error);
    });
  },

  /**
   * Query audit logs for a tenant with optional filters and pagination.
   */
  async findByTenant(
    tenantId: string,
    filters?: AuditLogFilters,
    pagination?: AuditPaginationParams,
  ): Promise<PaginatedResponse<AuditLog>> {
    return auditRepository.findByTenant(tenantId, filters, pagination);
  },

  /**
   * Query audit logs across all tenants with optional filters and pagination (admin use).
   */
  async findAll(
    filters?: AuditLogFilters,
    pagination?: AuditPaginationParams,
  ): Promise<PaginatedResponse<AuditLog>> {
    return auditRepository.findAll(filters, pagination);
  },

  /**
   * Delete audit logs older than the given date for retention cleanup.
   */
  async deleteOlderThan(tenantId: string, date: Date): Promise<number> {
    return auditRepository.deleteOlderThan(tenantId, date);
  },
};
