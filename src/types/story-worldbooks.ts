import { z } from 'zod';

export const storyWorldbookEntrySchema = z.object({
  id: z.string().uuid(), worldbookId: z.string().uuid(),
  keyword: z.string(), content: z.string(), position: z.number().int(),
  isEnabled: z.boolean(), priority: z.number().int(), settings: z.record(z.unknown()),
  characterFilter: z.array(z.string()), scanDepth: z.number().int().nullable(),
  contextPercentage: z.number().int().nullable(), recursive: z.boolean(), preventRecursion: z.boolean(),
});

export const storyWorldbooksSnapshotSchema = z.object({
  protocol: z.literal(1), capturedAt: z.string().datetime(), revision: z.string().regex(/^[a-f0-9]{64}$/),
  bindings: z.array(z.object({
    characterId: z.string().uuid(),
    books: z.array(z.object({
      id: z.string().uuid(), name: z.string(), entries: z.array(storyWorldbookEntrySchema),
    })),
  })),
}).strict();

export type StoryWorldbookEntry = z.infer<typeof storyWorldbookEntrySchema>;
export type StoryWorldbooksSnapshot = z.infer<typeof storyWorldbooksSnapshotSchema>;
