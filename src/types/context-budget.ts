import { z } from 'zod';

export const contextBudgetDetailsSchema = z.object({
  reason: z.enum(['critical', 'latest', 'pinned', 'payload', 'template']),
  contextWindow: z.number().int().positive().finite(),
  outputTokens: z.number().int().nonnegative().finite(),
  requiredTokens: z.number().int().nonnegative().finite(),
  availableTokens: z.number().int().nonnegative().finite(),
});

export type ContextBudgetDetails = z.infer<typeof contextBudgetDetailsSchema>;
