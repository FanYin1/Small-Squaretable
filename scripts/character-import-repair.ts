import { parseArgs } from 'node:util';
import { open, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { CharacterImportRepairError, characterRepairSchema, repairCharacterImport } from '../src/db/character-import-repair';

export async function main(args = process.argv.slice(2)) {
  const { values, tokens } = parseArgs({ args, tokens: true, strict: true, allowPositionals: false, options: {
    tenant: { type: 'string' }, owner: { type: 'string' }, character: { type: 'string' },
    'expected-review': { type: 'string' }, apply: { type: 'boolean' }, report: { type: 'string' }, help: { type: 'boolean' },
  } });
  const names = tokens.filter(token => token.kind === 'option').map(token => token.name);
  if (new Set(names).size !== names.length) throw new Error('REPAIR_DUPLICATE_ARGUMENT');
  if (values.help) {
    console.info('Explicit repair: node --import tsx scripts/character-import-repair.ts --tenant UUID --owner UUID --character UUID --expected-review SHA256 --apply --report NEW_FILE\nReview the read-only audit first. Set DATABASE_URL explicitly; no env file is loaded. Same review retries return a stored receipt without repeating the repair.');
    return;
  }
  const scope = characterRepairSchema.parse({ tenantId: values.tenant, ownerId: values.owner, characterId: values.character, expectedReview: values['expected-review'] });
  if (!values.apply || !values.report || !process.env.DATABASE_URL) throw new Error('REPAIR_CONFIGURATION_REQUIRED');
  const report = await open(values.report, 'wx', 0o600);
  let client: ReturnType<typeof postgres> | undefined;
  let completed = false;
  try {
    client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, onnotice: () => {} });
    const result = await repairCharacterImport(client, scope);
    await report.writeFile(JSON.stringify({ version: 1, ...result }, null, 2) + '\n');
    await report.sync();
    completed = true;
    console.info(JSON.stringify({ status: result.status, writePerformed: result.writePerformed, entryCount: result.entryCount, currentStateRechecked: result.currentStateRechecked }));
  } finally {
    try {
      await report.close();
      if (!completed) await unlink(values.report);
    } finally { await client?.end({ timeout: 5 }); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ code: error instanceof CharacterImportRepairError ? error.code : 'CHARACTER_IMPORT_REPAIR_FAILED',
      message: 'No success report available. For an interrupted apply, retry the same scope and review with a new report path to check the durable receipt.' }));
    process.exitCode = 1;
  });
}
