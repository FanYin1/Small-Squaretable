import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '../src/db/schema';
import { parseCharacterFile } from '../src/types/character-card-import';
import { collectPresentationSources, rebindPresentationDraft, revalidatePresentationDraft, verifyPresentationSelection } from '../src/server/services/story-presentation-workflow';
import { saveCharacterPresentation } from '../src/server/services/character-presentation.service';

const manifestSchema = z.object({ version: z.literal(1), target: z.literal('exploration-3081'),
  userId: z.string().uuid(), tenantId: z.string().uuid(), cards: z.array(z.object({
    characterId: z.string().uuid(), requestId: z.string().uuid(), card: z.string(), receipt: z.string(),
    cardDigest: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1).max(4) }).strict();
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
let stage = 'arguments';

async function privateFile(path: string, limit: number) {
  const metadata = await stat(path);
  assert.ok(metadata.isFile() && metadata.size <= limit && !(metadata.mode & 0o077), 'Private bounded input required');
  return readFile(path);
}

async function main() {
  const [mode, path, expectedPlan] = process.argv.slice(2);
  assert.ok((mode === 'plan' && !expectedPlan) || (mode === 'apply' && /^[a-f0-9]{64}$/.test(expectedPlan ?? '')), 'Use plan MANIFEST or apply MANIFEST PLAN_SHA256');
  const manifest = manifestSchema.parse(JSON.parse((await privateFile(path, 16 * 1024)).toString()));
  stage = 'target';
  assert.equal(process.env.PRESENTATION_ADOPTION_TARGET, manifest.target, 'Explicit candidate target required');
  assert.equal(new Set(manifest.cards.map(card => card.characterId)).size, manifest.cards.length);
  const target = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(target.pathname, '/squaretable_beta', 'This bounded bootstrap only targets the local candidate database');
  const client = postgres(target.toString(), { max: 1 });
  const database = drizzle(client, { schema });
  try {
    const result = await database.transaction(async transaction => {
      const prepared = [];
      for (const item of manifest.cards) {
        stage = `card-${prepared.length + 1}-inputs`;
        const bytes = await privateFile(item.card, 12 * 1024 * 1024);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), item.cardDigest, 'Original card fingerprint changed');
        const receiptBytes = await privateFile(item.receipt, 64 * 1024);
        const receipt = JSON.parse(receiptBytes.toString());
        assert.ok(['draft', 'preserved'].includes(receipt.result));
        const imported = (await parseCharacterFile(bytes)).character;
        const original = { id: receipt.draft.characterId, name: imported.name, description: imported.description ?? null, cardData: imported.cardData };
        stage = `card-${prepared.length + 1}-ownership`;
        const [row] = await transaction.select().from(schema.characters).where(eq(schema.characters.id, item.characterId)).for('update');
        assert.ok(row && row.creatorId === manifest.userId && row.tenantId === manifest.tenantId && !row.isPublic, 'Private owned candidate card required');
        const current = { id: row.id, name: row.name, description: row.description, cardData: row.cardData as Record<string, unknown> };
        stage = `card-${prepared.length + 1}-source-proof`;
        const previous = revalidatePresentationDraft(original, receipt.draft);
        const draft = previous.status === 'preserved'
          ? verifyPresentationSelection(current, collectPresentationSources(current), { version: 1, candidateId: null })
          : rebindPresentationDraft(original, current, previous);
        assert.equal(draft.status, previous.status);
        assert.equal(draft.text, previous.text, 'Existing introduction changed; preserve it without applying an old receipt');
        prepared.push({ item, draft, receiptDigest: createHash('sha256').update(receiptBytes).digest('hex') });
      }
      const plan = prepared.map(({ item, draft, receiptDigest }) => ({ characterId: item.characterId, requestId: item.requestId,
        sourceRevision: draft.sourceRevision, cardDigest: item.cardDigest, receiptDigest, status: draft.status }));
      const planDigest = digest({ userId: manifest.userId, tenantId: manifest.tenantId, target: manifest.target, plan });
      const versions = [];
      if (mode === 'apply') {
        stage = 'apply';
        assert.equal(planDigest, expectedPlan, 'Adoption plan changed');
        for (const { item, draft } of prepared) {
          if (draft.status !== 'draft') continue;
          const saved = await saveCharacterPresentation({ characterId: item.characterId, userId: manifest.userId,
            tenantId: manifest.tenantId, requestId: item.requestId, draft }, transaction);
          versions.push({ characterId: item.characterId, versionId: saved.id });
        }
      }
      return { status: mode === 'apply' ? 'applied' : 'planned', planDigest, plan, versions, modelCalls: 0 };
    });
    console.info(JSON.stringify(result));
  } finally { await client.end(); }
}

main().catch(error => { console.error(JSON.stringify({ code: 'PRESENTATION_ADOPTION_FAILED', stage,
  cause: ['PRESENTATION_SOURCE_STALE', 'PRESENTATION_DRAFT_INVALID'].includes(error?.message) ? error.message : 'CHECK_FAILED' })); process.exitCode = 1; });
