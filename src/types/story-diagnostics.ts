import { z } from 'zod';
import { cardRecord, characterFields } from './card-fields';
import { inspectStoryCapabilities, storyCapabilitiesSchema } from './story-capabilities';
import { diagnoseWorldbookDependencies, type CharacterWorldbookBinding } from './character-worldbook-bindings';
import { adapterArtifactSchema } from './story-adapter';

export const worldbookPurposeSchema = z.enum(['setting', 'knowledge', 'style', 'rules']);
export const worldbookPurposeLabels: Record<z.infer<typeof worldbookPurposeSchema>, string> = {
  setting: '背景设定', knowledge: '常识与概念', style: '表达风格', rules: '玩法规则',
};

export const authorPlayerIdentitySchema = z.object({
  protocol: z.literal(1), fixedName: z.string().trim().min(1).max(100),
}).strict();

export function inspectAuthorIdentity(card: unknown) {
  const fields = characterFields(card);
  const declaration = cardRecord(cardRecord(fields.extensions).squaretable).playerIdentity;
  if (declaration == null) return { status: 'unverified' as const };
  const parsed = authorPlayerIdentitySchema.safeParse(declaration);
  return parsed.success ? { status: 'fixed_name' as const, fixedName: parsed.data.fixedName } : { status: 'invalid' as const };
}

export const storyDiagnosticsSchema = z.object({
  protocol: z.literal(1),
  adaptation: adapterArtifactSchema.innerType().pick({ jobId: true, conclusion: true, reason: true, compiler: true }).optional(),
  capabilities: storyCapabilitiesSchema,
  books: z.object({
    bound: z.number().int().nonnegative(), active: z.number().int().nonnegative(),
    disabled: z.number().int().nonnegative(), empty: z.number().int().nonnegative(),
    dependencies: z.array(z.enum(['bound', 'disabled', 'empty', 'unbound', 'ambiguous'])),
    purposes: z.array(worldbookPurposeSchema), undeclaredPurpose: z.boolean(),
  }),
  identity: z.discriminatedUnion('status', [
    z.object({ status: z.literal('unverified') }), z.object({ status: z.literal('invalid') }),
    z.object({ status: z.literal('fixed_name'), fixedName: z.string().min(1).max(100) }),
  ]),
  multipleCharacters: z.boolean(),
}).strict();
export type StoryDiagnostics = z.infer<typeof storyDiagnosticsSchema>;

export type DiagnosticBook = CharacterWorldbookBinding & { entries: Array<{ content: string; isEnabled: boolean; settings?: unknown }> };

export function inspectStoryDiagnostics(card: Record<string, unknown>, characterId: string, books: DiagnosticBook[], multipleCharacters = false): StoryDiagnostics {
  const bound = books.filter(book => book.characterId === characterId && book.scope === 'character');
  const active = bound.filter(book => book.isEnabled);
  const entries = active.flatMap(book => book.entries.filter(entry => entry.isEnabled));
  const purposes = entries.map(entry => worldbookPurposeSchema.safeParse(cardRecord(entry.settings).squaretablePurpose));
  return {
    protocol: 1,
    capabilities: inspectStoryCapabilities(card, entries),
    books: {
      bound: bound.length, active: active.filter(book => book.enabledEntryCount > 0).length,
      disabled: bound.filter(book => !book.isEnabled).length,
      empty: active.filter(book => book.enabledEntryCount === 0).length,
      dependencies: diagnoseWorldbookDependencies(card, characterId, bound).map(dependency => dependency.status),
      purposes: [...new Set(purposes.flatMap(result => result.success ? [result.data] : []))],
      undeclaredPurpose: entries.length === 0 || purposes.some(result => !result.success),
    },
    identity: inspectAuthorIdentity(card), multipleCharacters,
  };
}

export function validateStoryIdentities(cards: Array<{ cardData: Record<string, unknown> }>, name: string): 'invalid' | 'conflict' | null {
  const identities = cards.map(card => inspectAuthorIdentity(card.cardData));
  if (identities.some(identity => identity.status === 'invalid')) return 'invalid';
  if (identities.some(identity => identity.status === 'fixed_name' && identity.fixedName !== name.trim())) return 'conflict';
  return null;
}
