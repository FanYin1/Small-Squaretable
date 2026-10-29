import { z } from 'zod';
import { openingReferenceSchema } from './story-opening';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const presentationCandidateSchema = z.object({
  id: digest, text: z.string().min(8).max(500),
  reference: openingReferenceSchema.refine(reference => reference.source !== 'none'),
  rawDigest: digest, start: z.number().int().nonnegative(), end: z.number().int().nonnegative(),
}).strict().refine(candidate => candidate.end - candidate.start === candidate.text.length);

export const presentationDraftSchema = z.object({
  version: z.literal(1), compiler: z.literal('public-excerpt-selection-v1'), characterId: z.string().uuid(), sourceRevision: digest,
  status: z.enum(['preserved', 'draft', 'unavailable']),
  reason: z.enum(['author-introduction', 'selected-excerpt', 'no-selection', 'no-public-excerpt', 'source-limit']),
  text: z.string().max(500), source: presentationCandidateSchema.nullable(),
  coverage: z.object({ candidateCount: z.number().int().min(0).max(32), omittedCandidates: z.number().int().nonnegative() }).strict(),
}).strict().superRefine((draft, context) => {
  const valid = draft.status === 'draft'
    ? draft.reason === 'selected-excerpt' && draft.source !== null && draft.text === draft.source.text && draft.coverage.candidateCount > 0
    : draft.status === 'preserved'
      ? draft.reason === 'author-introduction' && draft.text.length > 0 && draft.source === null
        && draft.coverage.candidateCount === 0 && draft.coverage.omittedCandidates === 0
      : ['no-selection', 'no-public-excerpt', 'source-limit'].includes(draft.reason) && draft.text === '' && draft.source === null;
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'PRESENTATION_DRAFT_INCONSISTENT' });
});

export type PresentationCandidate = z.infer<typeof presentationCandidateSchema>;
export type PresentationDraft = z.infer<typeof presentationDraftSchema>;

export const presentationVersionSchema = z.object({
  id: z.string().uuid(), draft: presentationDraftSchema,
}).strict();
export type PresentationVersion = z.infer<typeof presentationVersionSchema>;
