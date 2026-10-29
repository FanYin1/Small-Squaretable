import { parseArgs } from 'node:util';
import { open, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { auditCharacterImports, characterAuditScopeSchema } from '../src/db/character-import-audit';

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    tenant: { type: 'string' }, owner: { type: 'string' }, character: { type: 'string', multiple: true },
    report: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.info('Read-only audit: node --import tsx scripts/character-import-audit.ts --tenant UUID --owner UUID --character UUID [--character UUID] --report NEW_FILE\nSet DATABASE_URL in the process environment. No env file is loaded automatically. No repair or story mutation is performed.');
    return;
  }
  const scope = characterAuditScopeSchema.parse({ tenantId: values.tenant, ownerId: values.owner, characterIds: values.character });
  if (!values.report || !process.env.DATABASE_URL) throw new Error('AUDIT_CONFIGURATION_REQUIRED');
  const report = await open(values.report, 'wx', 0o600);
  let client: ReturnType<typeof postgres> | undefined;
  let completed = false;
  try {
    client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, onnotice: () => {} });
    const result = await auditCharacterImports(client, scope);
    await report.writeFile(JSON.stringify(result, null, 2) + '\n');
    await report.sync();
    completed = true;
    console.info(JSON.stringify({ mode: result.mode, total: result.results.length, summary: result.summary }));
  } finally {
    await report.close();
    if (!completed) await unlink(values.report);
    await client?.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('CHARACTER_IMPORT_AUDIT_FAILED: check arguments, explicit database environment and new report path. No repair was performed.');
    process.exitCode = 1;
  });
}
