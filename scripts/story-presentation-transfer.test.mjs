import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { collectPresentationSources, verifyPresentationSelection, revalidatePresentationDraft } from '../src/server/services/story-presentation-workflow.ts';
import { transferPresentation } from './story-presentation-transfer.mjs';

function fixture() {
  const character = { id: randomUUID(), name: '港口', description: null,
    cardData: { first_mes: '你看见码头的灯光，船长指向 /uploads/old/map.png ，等待你的回答。' } };
  const sources = collectPresentationSources(character);
  character.presentation = { id: randomUUID(), draft: verifyPresentationSelection(character, sources,
    { version: 1, candidateId: sources.candidates[0].id }) };
  return character;
}

test('remaps character proof against frozen sources without mutating original receipt', () => {
  const original = fixture();
  const before = JSON.stringify(original);
  const destination = { ...structuredClone(original), id: randomUUID() };
  destination.presentation = transferPresentation(original, destination);
  assert.notEqual(destination.presentation.draft.sourceRevision, original.presentation.draft.sourceRevision);
  assert.deepEqual(destination.presentation.draft.source, original.presentation.draft.source);
  assert.equal(revalidatePresentationDraft(destination, destination.presentation.draft).text, original.presentation.draft.text);
  assert.equal(JSON.stringify(original), before);
});

test('rebuilds raw digest, candidate ID and offsets after local attachment rewriting', () => {
  const original = fixture();
  const rewrite = value => value.replaceAll('/uploads/old/map.png', '/uploads/new/longer/path/map.png');
  const destination = { ...structuredClone(original), id: randomUUID(), cardData: { first_mes: rewrite(original.cardData.first_mes) } };
  destination.presentation = transferPresentation(original, destination, rewrite);
  assert.notEqual(destination.presentation.draft.source.rawDigest, original.presentation.draft.source.rawDigest);
  assert.equal(revalidatePresentationDraft(destination, destination.presentation.draft).text, rewrite(original.presentation.draft.text));
});

test('rejects corrupt original proofs, modified sources and unsupported rewritten paragraphs', () => {
  const original = fixture();
  const destination = { ...structuredClone(original), id: randomUUID() };
  const tampered = structuredClone(original);
  tampered.presentation.draft.sourceRevision = '0'.repeat(64);
  assert.throws(() => transferPresentation(tampered, destination), /STALE/);
  destination.cardData.first_mes = '完全不同的开场，不能伪造原来的出处。';
  assert.throws(() => transferPresentation(original, destination), /cannot be verified/);
  const rewrite = value => value.replaceAll('/uploads/old/map.png', 'x'.repeat(600));
  destination.cardData.first_mes = rewrite(original.cardData.first_mes);
  assert.throws(() => transferPresentation(original, destination, rewrite), /cannot be verified/);
});
