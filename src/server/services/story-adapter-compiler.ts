import { createHash } from 'node:crypto';
import { getStoryRules, storyRulesSchema } from '../../types/story-state';
import { adapterArtifactSchema, type AdapterArtifact } from '../../types/story-adapter';
import { openingContent, openingReferences, stripStoryControlBlocks } from '../../types/story-opening';
import type { StorySources } from './story-diagnostics.service';
import type { StoryContentSnapshot } from '../../types/story-content';
import { inspectAdaptationFindings } from './story-adaptation.service';
import { reviewedRitualSource } from './story-ritual-adapter';
import { ritualIdentityEffect, ritualRules } from '../../types/story-ritual';
import { reviewedOpeningModeSource } from './story-opening-mode-adapter';
import { openingModeRules } from '../../types/story-opening-mode';
import { reviewedFirstTaskSource } from './story-first-task-adapter';
import { firstTaskRules } from '../../types/story-first-task';

function unconditionalSource(entry: StorySources['books'][number]['entries'][number], characterId: string): boolean {
  const settings = entry.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const options = settings as Record<string, unknown>;
  if (options.constant !== true || (options.probability ?? 100) !== 100) return false;
  if (['delay', 'cooldown', 'sticky'].some(key => (options[key] ?? 0) !== 0)) return false;
  const filter = (entry as Record<string, unknown>).characterFilter;
  return filter == null || Array.isArray(filter) && filter.every(value => typeof value === 'string')
    && (!filter.length || filter.includes(characterId));
}

export function compileStoryAdapter(content: StoryContentSnapshot, sources: StorySources, jobId: string, sourceRevision: string): AdapterArtifact {
  const character = content.characters[0];
  const base = { version: 1 as const, compiler: 'finite-rules-v1' as const, jobId, characterId: character.id, sourceRevision };
  const finish = (conclusion: AdapterArtifact['conclusion'], reason: AdapterArtifact['reason'], proof: AdapterArtifact['sources'] = []) =>
    adapterArtifactSchema.parse({ ...base, conclusion, reason, sources: proof });
  const entries = sources.books.filter(book => book.characterId === character.id && book.scope === 'character' && book.isEnabled)
    .flatMap(book => book.entries.flatMap((entry, entryIndex) => entry.isEnabled ? [{ bookId: book.id, entryIndex, content: entry.content, entry }] : []));
  if (entries.length > 2000 || entries.reduce((total, entry) => total + entry.content.length, 0) > 2_000_000) return finish('review', 'source-limit');
  const declarations = entries.flatMap(entry => [...entry.content.matchAll(/^```squaretable-rules-v1\s*\r?\n([\s\S]*?)^```\s*$/gm)]
    .map(match => ({ raw: match[1], unconditional: unconditionalSource(entry.entry, character.id), proof: { bookId: entry.bookId, entryIndex: entry.entryIndex,
      digest: createHash('sha256').update(entry.content).digest('hex') } })));
  let native;
  try { native = getStoryRules(character.cardData); }
  catch { return finish('invalid', 'invalid-declaration'); }
  if (native && declarations.length) return finish('review', 'native-conflict', declarations.slice(0, 2).map(item => item.proof));
  if (native) return finish('native', 'native');
  if (declarations.length > 1) return finish('review', 'multiple-declarations', declarations.slice(0, 2).map(item => item.proof));
  if (!declarations.length) {
    const reviewed = reviewedRitualSource(content, sources);
    if (reviewed) return adapterArtifactSchema.parse({ ...base, conclusion: 'supported', reason: 'reviewed-ritual',
      sources: [reviewed], rules: ritualRules(ritualIdentityEffect), turnEffect: ritualIdentityEffect });
    const modeSource = reviewedOpeningModeSource(content, sources);
    if (modeSource) return adapterArtifactSchema.parse({ ...base, conclusion: 'supported', reason: 'reviewed-opening-mode',
      sources: [modeSource], rules: openingModeRules() });
    const firstTaskSource = reviewedFirstTaskSource(content, sources);
    if (firstTaskSource) return adapterArtifactSchema.parse({ ...base, conclusion: 'supported', reason: 'reviewed-first-task',
      sources: [firstTaskSource], rules: firstTaskRules() });
    return finish('unsupported', 'no-declaration');
  }
  const proof = [declarations[0].proof];
  if (!declarations[0].unconditional) return finish('review', 'conditional-source', proof);
  const cardText = Object.values(character.cardData).filter((value): value is string => typeof value === 'string');
  const controlled = [...cardText, ...openingReferences(character.cardData).map(reference => openingContent(character.cardData, reference) ?? ''), ...entries.map(entry => entry.content)]
    .some(text => stripStoryControlBlocks(text) !== text || /<script\b|\b(?:VariableInsert|UpdateVariable)\b/i.test(text));
  const extensions = character.cardData.extensions as Record<string, unknown> | undefined;
  const externalScripts = extensions && ['tavern_helper', 'scripts', 'regex_scripts', 'TavernHelper_scripts'].some(key => extensions[key] != null);
  if (controlled || externalScripts || inspectAdaptationFindings(character.id, sources.books).length) return finish('review', 'external-mechanisms', proof);
  if (declarations[0].raw.length > 64_000) return finish('invalid', 'invalid-declaration', proof);
  try {
    const rules = storyRulesSchema.parse(JSON.parse(declarations[0].raw));
    if (rules.map || !rules.fields.length || !rules.actions.length) return finish('invalid', 'invalid-declaration', proof);
    return adapterArtifactSchema.parse({ ...base, conclusion: 'supported', reason: 'compiled', sources: proof, rules });
  } catch { return finish('invalid', 'invalid-declaration', proof); }
}

export function isCurrentStoryAdapter(artifact: AdapterArtifact, content: StoryContentSnapshot, sources: StorySources): boolean {
  if (artifact.conclusion !== 'supported') return true;
  const current = compileStoryAdapter(content, sources, artifact.jobId, artifact.sourceRevision);
  return JSON.stringify(current) === JSON.stringify(artifact);
}
