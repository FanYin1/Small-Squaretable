import assert from 'node:assert/strict';
import { collectPresentationSources, revalidatePresentationDraft, verifyPresentationSelection } from '../src/server/services/story-presentation-workflow.ts';
import { openingContent, openingDisplayText } from '../src/types/story-opening.ts';

export function transferPresentation(original, destination, rewrite = value => value) {
  if (!original.presentation) return;
  const draft = revalidatePresentationDraft(original, original.presentation.draft);
  assert.equal(draft.status, 'draft', 'Only a sourced draft can be transferred');
  const sourceText = openingDisplayText(openingContent(original.cardData, draft.source.reference));
  const start = rewrite(sourceText.slice(0, draft.source.start)).length;
  const text = rewrite(draft.text);
  const sources = collectPresentationSources(destination);
  const candidate = sources.candidates.find(item => item.reference.source === draft.source.reference.source
    && item.reference.index === draft.source.reference.index && item.start === start && item.text === text);
  assert.ok(candidate, 'Transferred presentation source cannot be verified after attachment rewriting');
  return { id: original.presentation.id,
    draft: verifyPresentationSelection(destination, sources, { version: 1, candidateId: candidate.id }) };
}
