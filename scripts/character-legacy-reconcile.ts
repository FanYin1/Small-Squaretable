import { parseArgs } from 'node:util';
import { open, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { MAX_CHARACTER_FILE_BYTES } from '../src/types/character-card-import';
import { CharacterLegacyError, legacyRequestSchema, legacyPlanSchema, legacyScopeSchema,
  prepareLegacyExternalSource, planCharacterLegacy, applyCharacterLegacy, readCharacterLegacyReceipt } from '../src/db/character-legacy-reconciliation';

async function boundedFile(path: string, limit: number) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > limit) throw new CharacterLegacyError('LEGACY_FILE_LIMIT');
    const bytes = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await file.read(bytes, size, bytes.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size > limit) throw new CharacterLegacyError('LEGACY_FILE_LIMIT');
    return bytes.subarray(0, size);
  } finally { await file.close(); }
}
async function jsonFile(path: string) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedFile(path, 65536)));
}
export async function main(args = process.argv.slice(2)) {
  const { values, tokens } = parseArgs({ args, tokens: true, strict: true, allowPositionals: false, options: {
    mode: { type: 'string' }, request: { type: 'string' }, plan: { type: 'string' }, scope: { type: 'string' },
    'source-file': { type: 'string' }, 'expected-plan': { type: 'string' }, report: { type: 'string' }, help: { type: 'boolean' },
  } });
  const names = tokens.filter(token => token.kind === 'option').map(token => token.name);
  if (new Set(names).size !== names.length) throw new Error('DUPLICATE_ARGUMENT');
  if (values.help) {
    console.info('Explicit single-card reconciliation; set DATABASE_URL, no env file is loaded.\n--mode plan --request FILE [--source-file FILE] --report NEW_FILE\n--mode apply --plan FILE --expected-plan SHA256 [--source-file FILE] --report NEW_FILE\n--mode receipt --scope FILE --expected-plan SHA256 --report NEW_FILE\nReports omit source text. Review every binding and the fingerprint before apply. Receipt retries never restore later changes.');
    return;
  }
  const mode = values.mode;
  if (!['plan', 'apply', 'receipt'].includes(mode ?? '') || !values.report || !process.env.DATABASE_URL) throw new Error('CONFIGURATION_REQUIRED');
  if (mode === 'plan' && (!values.request || values.plan || values.scope || values['expected-plan'])) throw new Error('PLAN_ARGUMENTS');
  if (mode === 'apply' && (!values.plan || !values['expected-plan'] || values.request || values.scope)) throw new Error('APPLY_ARGUMENTS');
  if (mode === 'receipt' && (!values.scope || !values['expected-plan'] || values.request || values.plan || values['source-file'])) throw new Error('RECEIPT_ARGUMENTS');
  const plan = mode === 'apply' ? legacyPlanSchema.parse((await jsonFile(values.plan!)).plan) : undefined;
  const request = mode === 'plan' ? legacyRequestSchema.parse(await jsonFile(values.request!)) : plan?.request;
  const scope = mode === 'receipt' ? legacyScopeSchema.parse(await jsonFile(values.scope!)) : undefined;
  if (request && (request.source.kind === 'file') !== !!values['source-file']) throw new CharacterLegacyError('LEGACY_SOURCE_REQUIRED');
  const sourceBytes = values['source-file'] ? await boundedFile(values['source-file'], MAX_CHARACTER_FILE_BYTES) : undefined;
  const external = sourceBytes ? await prepareLegacyExternalSource(sourceBytes) : undefined;
  const output = await open(values.report, 'wx', 0o600);
  let client: ReturnType<typeof postgres> | undefined;
  let completed = false;
  let archived = false;
  try {
    if (sourceBytes) {
      const archive = await open(`${values.report}.source`, 'wx', 0o600);
      archived = true;
      try { await archive.writeFile(sourceBytes); await archive.sync(); }
      finally { await archive.close(); }
    }
    client = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 10, onnotice: () => {} });
    const result = mode === 'plan'
      ? { mode, plan: await planCharacterLegacy(client, request!, external) }
      : mode === 'apply'
        ? { mode, plan, receipt: await applyCharacterLegacy(client, plan!, values['expected-plan']!, external) }
        : { mode, receipt: await readCharacterLegacyReceipt(client, scope!, values['expected-plan']!) };
    await output.writeFile(JSON.stringify(result, null, 2) + '\n');
    await output.sync();
    completed = true;
    console.info(JSON.stringify({ mode, status: result.receipt?.status ?? 'review_required', fingerprint: result.plan?.fingerprint ?? result.receipt?.fingerprint, writePerformed: result.receipt?.writePerformed ?? false }));
  } finally {
    try {
      await output.close();
      if (!completed) { await unlink(values.report); if (archived) await unlink(`${values.report}.source`); }
    }
    finally { await client?.end({ timeout: 5 }); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ code: error instanceof CharacterLegacyError ? error.code : 'CHARACTER_LEGACY_RECONCILIATION_FAILED',
      message: 'No success report. If apply was interrupted, use receipt with the same scope and plan fingerprint; do not create another plan blindly.' }));
    process.exitCode = 1;
  });
}
