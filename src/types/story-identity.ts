import { z } from 'zod';

export const storyIdentitySnapshotSchema = z.object({
  protocol: z.literal(1),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  source: z.enum(['account', 'persona']),
  sourceId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.string().datetime(),
}).strict();

export type StoryIdentitySnapshot = z.infer<typeof storyIdentitySnapshotSchema>;
