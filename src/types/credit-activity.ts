import { z } from 'zod';

export const creditKindSchema = z.enum(['topup', 'charge', 'reversal']);
export const creditRangeShape = {
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
};

export function validateCreditRange(range: { from?: string; to?: string }, context: z.RefinementCtx) {
  if (range.from === undefined && range.to === undefined) return;
  if (!range.from || !range.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Both range boundaries are required' });
    return;
  }
  const duration = Date.parse(range.to) - Date.parse(range.from);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 366 * 86400000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Range must be positive and no longer than 366 days' });
  }
}

export const creditActivityQuerySchema = z.object(creditRangeShape).superRefine(validateCreditRange);
export type CreditRange = z.infer<typeof creditActivityQuerySchema>;
export interface CreditLedgerFilters extends Partial<CreditRange> {
  kind?: z.infer<typeof creditKindSchema>;
  chatId?: string;
}

export function recordedCreditUsage(metadata: unknown): { inputTokens: number; outputTokens: number } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const { inputTokens, outputTokens } = metadata as Record<string, unknown>;
  return typeof inputTokens === 'number' && typeof outputTokens === 'number'
    && Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0
    ? { inputTokens, outputTokens } : null;
}

export interface CreditActivity {
  from: string;
  to: string;
  spentPoints: number;
  creditedPoints: number;
  adjustmentPoints: number;
  chargeCount: number;
  knownUsageCount: number;
  unknownUsageCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
}
