/**
 * Report API
 *
 * 用户侧举报入口。服务端 POST /api/v1/reports 一直存在，
 * 但在此之前前端没有任何调用方——也就是说举报功能对用户等于不存在。
 */

import { api } from './api';
import type { SubmitReportInput } from '@/types/moderation';

export interface SubmittedReport {
  id: string;
  targetType: string;
  targetId: string;
  category: string;
  reason: string;
  status: string;
  createdAt: string;
}

export const reportApi = {
  submitReport: (input: SubmitReportInput) =>
    api.post<SubmittedReport>('/reports', input),
};
