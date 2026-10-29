import { z } from 'zod';

export const storyMemoryStatusSchema = z.enum(['pending', 'running', 'retry', 'failed', 'succeeded']);
const count = z.number().int().nonnegative();
const messageId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const storyMemoryViewSchema = z.object({
  supported: z.boolean(),
  batchSize: z.literal(5),
  counts: z.object({ pending: count, running: count, retry: count, failed: count, succeeded: count }),
  accumulating: z.array(z.object({ characterId: z.string().uuid(), characterName: z.string().nullable(), turns: count })),
  jobs: z.array(z.object({
    id: z.string().uuid(), characterName: z.string().nullable(), status: storyMemoryStatusSchema,
    recoveryPending: z.boolean(), retainedMemories: count,
    sourcesAvailable: z.boolean(),
    sources: z.array(z.object({ version: count, inputMessageId: messageId, messageId })),
  })),
  nextBefore: z.string().uuid().nullable(),
});
export type StoryMemoryView = z.infer<typeof storyMemoryViewSchema>;
