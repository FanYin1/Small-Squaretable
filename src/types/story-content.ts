import { z } from 'zod';
import { inspectStoryCapabilities } from './story-capabilities';
import { storyDiagnosticsSchema } from './story-diagnostics';
import { openingSelectionSchema, openingContent, openingDisplayText } from './story-opening';
import { presentationVersionSchema } from './story-presentation';
import { openingRecordSchema } from './story-opening-record';
import { storyAdaptationReportSchema } from './story-adaptation';
import { adapterArtifactSchema, frozenStoryRules } from './story-adapter';
import { storyRuleScopeReasons } from './story-rule-scope';
import { firstTaskScope, firstTaskOpeningDigest } from './story-first-task';

export const storyCharacterSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1), description: z.string().nullable(),
  avatarUrl: z.string().nullable(), promptTemplate: z.string().nullable(), cardData: z.record(z.unknown()),
  diagnostics: storyDiagnosticsSchema.optional(),
  opening: openingSelectionSchema.optional(),
  openingRecord: openingRecordSchema.optional(),
  adaptationReport: storyAdaptationReportSchema.optional(),
  adaptation: adapterArtifactSchema.optional(),
  presentation: presentationVersionSchema.optional(),
}).superRefine((character, context) => {
  const presentation = character.presentation?.draft;
  if (presentation && (presentation.characterId !== character.id || presentation.status !== 'draft' || !presentation.source
    || openingDisplayText(openingContent(character.cardData, presentation.source.reference) ?? '')
      .slice(presentation.source.start, presentation.source.end) !== presentation.text)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Presentation does not belong to the saved character source' });
  }
  if (character.adaptation) {
    if (character.adaptation.characterId !== character.id) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Adaptation belongs to another character' });
    try { frozenStoryRules(character); }
    catch { context.addIssue({ code: z.ZodIssueCode.custom, message: 'Conflicting adaptation rules' }); }
  }
  if (character.adaptationReport && (!character.opening
    || character.adaptationReport.entryRevision !== character.opening.revision
    || character.adaptationReport.opening.source !== character.opening.reference.source
    || character.adaptationReport.opening.index !== character.opening.reference.index)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Compatibility report does not belong to the selected opening version' });
  }
  if (character.adaptationReport?.ruleScope
    && character.adaptation?.reason !== storyRuleScopeReasons[character.adaptationReport.ruleScope]) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Compatibility scope does not belong to the frozen adapter' });
  }
  if (character.adaptation?.reason === 'reviewed-first-task' && character.opening
    && (character.opening.reference.source !== 'first_mes' || character.opening.reference.index !== 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'First task requires the reviewed first opening' });
  }
  if (character.adaptationReport?.ruleScope === firstTaskScope && character.adaptationReport.opening.source !== 'first_mes') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'First task scope requires the first opening' });
  }
  if (character.openingRecord?.reason === 'reviewed-first-task'
    && (character.adaptation?.reason !== 'reviewed-first-task' || character.openingRecord.status !== 'native'
      || character.openingRecord.source.digest !== firstTaskOpeningDigest)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'First task opening record requires its reviewed adapter and source' });
  }
  if (character.openingRecord && (!character.opening
    || character.openingRecord.source.opening.source !== character.opening.reference.source
    || character.openingRecord.source.opening.index !== character.opening.reference.index)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Initial record does not belong to the selected opening' });
  }
  if (!character.opening) return;
  if (character.opening.characterId !== character.id || (character.opening.reference.source !== 'none'
    && openingContent(character.cardData, character.opening.reference) === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Opening reference does not belong to the saved character' });
  }
});

export const storyContentSnapshotSchema = z.object({
  protocol: z.literal(1), revision: z.string().regex(/^[a-f0-9]{64}$/), capturedAt: z.string().datetime(),
  characters: z.array(storyCharacterSchema),
}).strict();

export type StoryCharacter = z.infer<typeof storyCharacterSchema>;
export type StoryContentSnapshot = z.infer<typeof storyContentSnapshotSchema>;

export function storyCharacterPreview(character: StoryCharacter, sortOrder: number) {
  const { first_mes, alternate_greetings } = character.cardData;
  const selected = character.opening ? openingContent(character.cardData, character.opening.reference) ?? '' : null;
  return {
    id: character.id, name: character.name, avatarUrl: character.avatarUrl, sortOrder,
    compatibility: character.diagnostics?.capabilities ?? inspectStoryCapabilities(character.cardData),
    ...(character.diagnostics ? { diagnostics: character.diagnostics } : {}),
    cardData: {
      first_mes: selected ?? (typeof first_mes === 'string' ? first_mes : ''),
      alternate_greetings: selected !== null ? [] : Array.isArray(alternate_greetings) ? alternate_greetings.filter(value => typeof value === 'string') : [],
    },
  };
}
