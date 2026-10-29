import { z } from 'zod';

export const branchInputSchema = z.object({
  requestId: z.string().uuid(),
  throughVersion: z.number().int().min(0).max(2000),
  mode: z.enum(['choice', 'evidenced', 'conflict', 'adaptation']),
  direction: z.string().trim().min(1).max(2000),
  evidenceIds: z.array(z.number().int().positive()).max(8).default([]),
}).strict().superRefine((input, context) => {
  if ((input.mode === 'evidenced' && input.evidenceIds.length < 1) || (input.mode === 'conflict' && new Set(input.evidenceIds).size < 2)) {
    context.addIssue({ code: 'custom', path: ['evidenceIds'], message: '请选择本存档中可见的依据；冲突解释至少需要两条。' });
  }
});
export const branchCommitSchema = z.object({ input: branchInputSchema, previewDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type StoryBranchInput = z.infer<typeof branchInputSchema>;

export const readingInputSchema = z.object({
  requestId: z.string().uuid(), messageId: z.number().int().positive(),
  kind: z.enum(['annotation', 'layout']), content: z.string().min(1).max(50000).refine(value => value.trim().length > 0),
}).strict().transform(input => ({ ...input, content: input.kind === 'annotation' ? input.content.trim() : input.content }));
export type StoryReadingInput = z.infer<typeof readingInputSchema>;
export interface StoryReading {
  id: string; messageId: number; kind: 'annotation' | 'layout'; content: string; createdAt: string;
}
export interface StoryBranchInfo {
  chatId: string; rootId: string; parentId: string; throughVersion: number;
  mode: StoryBranchInput['mode']; direction: string; evidenceIds: number[];
}
export interface StoryBranchPreview {
  digest: string; throughVersion: number; latestVersion: number;
  retainedMessages: number; discardedMessages: number; discardedEvents: number;
  fields: Array<{ label: string; value: unknown; unit?: string }>;
  evidence: Array<{ id: number; content: string }>;
}

export function safeReadingLayout(original: string, candidate: string): boolean {
  if (original === candidate || /[`<>#*_|{}[\]\\\r]/u.test(original)) return false;
  if (/^\s*(?:[-+>]|\d+[.)])\s/mu.test(original)) return false;
  const lines = (value: string) => value.split('\n').filter(line => line.trim().length > 0);
  return JSON.stringify(lines(original)) === JSON.stringify(lines(candidate)) && candidate.length <= original.length + 200;
}
