/**
 * Report Repository
 *
 * Data access layer for user-submitted reports.
 */

import { eq, sql, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { reports, type Report, type NewReport } from '../schema/reports';
import type { PaginatedResponse } from '../../types/api';

export class ReportRepository extends BaseRepository {
  async create(data: NewReport): Promise<Report> {
    const result = await this.db.insert(reports).values(data).returning();
    return result[0];
  }

  async findById(id: string): Promise<Report | null> {
    const result = await this.db
      .select()
      .from(reports)
      .where(eq(reports.id, id));
    return result[0] ?? null;
  }

  async findPending(page: number = 1, limit: number = 20): Promise<PaginatedResponse<Report>> {
    const offset = (page - 1) * limit;

    const [items, [{ count }]] = await Promise.all([
      this.db
        .select()
        .from(reports)
        .where(eq(reports.status, 'pending'))
        .orderBy(desc(reports.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(reports)
        .where(eq(reports.status, 'pending')),
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

  async resolve(id: string, resolvedBy: string, status: 'resolved' | 'dismissed'): Promise<void> {
    await this.db
      .update(reports)
      .set({
        status,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(eq(reports.id, id));
  }
}

export const reportRepository = new ReportRepository(db);
