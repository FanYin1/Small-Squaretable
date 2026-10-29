import { createHash } from 'node:crypto';
import { AppError } from '../../core/errors';
import { inspectAuthorIdentity } from '../../types/story-diagnostics';
import { inspectStoryCapabilities } from '../../types/story-capabilities';
import { getStoryRules, matchesStoryConditions } from '../../types/story-state';
import { inspectOpening, openingContent, openingReferences, openingSelectable, storyIntroduction,
  type OpeningSelection, type StoryEntryProfile } from '../../types/story-opening';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import { openingRecordAdapter, prepareOpeningRecord } from './story-opening-record.service';
import { inspectAdaptationFindings, prepareAdaptationReport } from './story-adaptation.service';
import { frozenStoryRules } from '../../types/story-adapter';
import { openingModeScope } from '../../types/story-opening-mode';
import { firstTaskScope } from '../../types/story-first-task';
import { prepareFirstTaskOpeningRecord } from './story-first-task-adapter';

export function storyEntryRevision(content: StoryContentSnapshot, sources: StorySources): string {
  return createHash('sha256').update(JSON.stringify({ preparationVersion: 3, characters: content.characters, books: sources.books })).digest('hex');
}

export function buildStoryEntryProfile(content: StoryContentSnapshot, sources: StorySources): StoryEntryProfile {
  const character = content.characters[0];
  let rules: ReturnType<typeof getStoryRules> = null;
  let rulesStatus: StoryEntryProfile['rulesStatus'] = 'unadapted';
  try {
    rules = frozenStoryRules(character, 'author');
    if (rules) rulesStatus = character.adaptation?.rules ? 'adapted' : 'native';
  } catch { rulesStatus = 'invalid'; }
  const adapter = openingRecordAdapter(character.cardData);
  const revision = storyEntryRevision(content, sources);
  const findings = inspectAdaptationFindings(character.id, sources.books);
  const openings = openingReferences(character.cardData).map(reference => {
    const record = character.adaptation?.reason === 'reviewed-first-task'
      ? prepareFirstTaskOpeningRecord(character.cardData, reference)
      : prepareOpeningRecord(character.cardData, reference, rules !== null, adapter);
    return { ...inspectOpening(character.cardData, reference), record,
      adaptationReport: { ...prepareAdaptationReport(revision, reference, record, rulesStatus, findings),
        ...(character.adaptation?.turnEffect ? { turnEffect: character.adaptation.turnEffect } : {}),
        ...(character.adaptation?.reason === 'reviewed-opening-mode' ? { ruleScope: openingModeScope } : {}),
        ...(character.adaptation?.reason === 'reviewed-first-task' ? { ruleScope: firstTaskScope } : {}) } };
  });
  const initial = Object.fromEntries((rules?.fields ?? []).map(field => [field.id, field.initial]));
  return {
    characterId: character.id, revision, name: character.name, avatarUrl: character.avatarUrl,
    description: storyIntroduction(character.description, character.cardData, character.presentation),
    ...(character.presentation ? { presentation: character.presentation } : {}),
    openings, identity: inspectAuthorIdentity(character.cardData), rulesStatus,
    ...(character.adaptation ? { adaptation: { jobId: character.adaptation.jobId, conclusion: character.adaptation.conclusion,
      reason: character.adaptation.reason, compiler: character.adaptation.compiler } } : {}),
    compatibilityIssues: (character.diagnostics?.capabilities ?? inspectStoryCapabilities(character.cardData)).issues,
    initialFields: (rules?.fields ?? []).filter(field => field.visible && matchesStoryConditions(field.visibleWhen, initial))
      .map(field => ({ id: field.id, label: field.label, value: field.initial, ...(field.unit ? { unit: field.unit } : {}) })),
  };
}

export function selectStoryOpening(content: StoryContentSnapshot, sources: StorySources, selection: OpeningSelection): string | null {
  const character = content.characters[0];
  if (content.characters.length !== 1 || character.id !== selection.characterId) {
    throw new AppError('开场不属于本次故事。请重新选择。', 409, 'STORY_OPENING_INVALID');
  }
  if (selection.revision !== storyEntryRevision(content, sources)) {
    throw new AppError('角色卡或绑定资料已经更新，请重新查看开场。', 409, 'STORY_ENTRY_CHANGED');
  }
  const profile = buildStoryEntryProfile(content, sources);
  if (selection.reference.source === 'none') {
    if (!selection.reviewed || profile.openings.some(openingSelectable)) throw new AppError('请先选择一个开场，或确认自行输入第一步。', 409, 'STORY_OPENING_REQUIRED');
  } else {
    const opening = profile.openings.find(item => item.reference.source === selection.reference.source && item.reference.index === selection.reference.index);
    if (!opening || !openingSelectable(opening) || (opening.kind === 'review' && !selection.reviewed)) {
      throw new AppError('该内容不是可直接使用的开场，或尚未确认兼容限制。', 409, 'STORY_OPENING_INVALID');
    }
    if (opening.record?.status === 'conflict') throw new AppError('原生规则与外部初始化尚未核对，请先修复配置。', 409, 'STORY_INITIAL_RULES_CONFLICT');
  }
  character.opening = selection;
  character.openingRecord = profile.openings.find(item => item.reference.source === selection.reference.source
    && item.reference.index === selection.reference.index)?.record
    ?? prepareOpeningRecord(character.cardData, selection.reference, ['native', 'adapted'].includes(profile.rulesStatus));
  character.adaptationReport = prepareAdaptationReport(profile.revision, selection.reference, character.openingRecord,
    profile.rulesStatus, inspectAdaptationFindings(character.id, sources.books));
  if (character.adaptation?.turnEffect) character.adaptationReport.turnEffect = character.adaptation.turnEffect;
  if (character.adaptation?.reason === 'reviewed-opening-mode') character.adaptationReport.ruleScope = openingModeScope;
  if (character.adaptation?.reason === 'reviewed-first-task') character.adaptationReport.ruleScope = firstTaskScope;
  content.revision = createHash('sha256').update(JSON.stringify(content.characters)).digest('hex');
  return openingContent(character.cardData, selection.reference);
}
