#!/usr/bin/env npx tsx
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { createCharacterWithWorldbook } from '../src/db/character-import';
import { importStandaloneWorldbook } from '../src/db/worldbook-import';
import { CharacterCardImportError, MAX_CHARACTER_FILE_BYTES, parseCharacterFile } from '../src/types/character-card-import';
import { createCharacterSchema } from '../src/types/character';
import { characterWorldbookSchema } from '../src/types/character-worldbook';
import { isStandaloneWorldbook, prepareStandaloneWorldbook } from '../src/types/worldbook-import';

export interface ImportOptions {
  directory: string;
  email?: string;
  dryRun: boolean;
  includeWorldbooks: boolean;
}

interface FileResult {
  file: string;
  status: 'ready' | 'imported' | 'failed' | 'duplicate' | 'skipped';
  kind?: 'character' | 'worldbook';
  code?: string;
  sha256?: string;
  entries?: number;
  id?: string;
}

export async function prepareImportFile(bytes: Uint8Array) {
  if (bytes.length > MAX_CHARACTER_FILE_BYTES) throw new CharacterCardImportError('FILE_TOO_LARGE');
  const start = new TextDecoder().decode(bytes).trimStart()[0];
  if (start === '{') {
    let original: unknown;
    try { original = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new CharacterCardImportError('INVALID_JSON'); }
    if (isStandaloneWorldbook(original)) {
      const prepared = prepareStandaloneWorldbook(original);
      return { kind: 'worldbook' as const, original, entries: prepared.entries.length };
    }
  }
  const parsed = await parseCharacterFile(bytes);
  const input = createCharacterSchema.parse({
    ...parsed.character,
    avatarUrl: parsed.format === 'png' ? `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` : parsed.character.avatarUrl,
  });
  const embedded = input.cardData.character_book;
  const entries = embedded == null ? 0 : characterWorldbookSchema.parse(embedded).entries.length;
  return { kind: 'character' as const, input, entries };
}

export async function runImport(options: ImportOptions) {
  const directory = resolve(options.directory);
  const files: Array<{ path: string; regular: boolean }> = [];
  async function scan(current: string) {
    for (const item of (await readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(current, item.name);
      if (item.isDirectory()) await scan(path);
      else files.push({ path, regular: item.isFile() });
    }
  }
  await scan(directory);
  const results: FileResult[] = [];
  const seen = new Set<string>();
  let connection: ReturnType<typeof postgres> | undefined;
  try {
    if (!options.dryRun && (!options.email || !process.env.DATABASE_URL)) throw new Error('IMPORT_CONFIGURATION_REQUIRED');
    connection = options.dryRun ? undefined : postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 10 });
    const database = connection ? drizzle(connection, { schema }) : undefined;
    const owner = database ? (await database.select({ id: schema.users.id, tenantId: schema.users.tenantId })
      .from(schema.users).where(eq(schema.users.email, options.email!)).limit(1))[0] : undefined;
    if (database && !owner) throw new Error('IMPORT_OWNER_NOT_FOUND');
    for (const file of files) {
      const result: FileResult = { file: relative(directory, file.path), status: 'failed' };
      results.push(result);
      if (!file.regular || !['.png', '.json', '.jpg', '.jpeg', '.webp'].includes(extname(file.path).toLowerCase())) {
        result.status = 'skipped';
        result.code = file.regular ? 'UNSUPPORTED_EXTENSION' : 'NON_REGULAR_FILE';
        continue;
      }
      try {
        if ((await stat(file.path)).size > MAX_CHARACTER_FILE_BYTES) throw new CharacterCardImportError('FILE_TOO_LARGE');
        const bytes = await readFile(file.path);
        result.sha256 = createHash('sha256').update(bytes).digest('hex');
        const prepared = await prepareImportFile(bytes);
        result.kind = prepared.kind;
        result.entries = prepared.entries;
        if (prepared.kind === 'worldbook' && !options.includeWorldbooks) {
          result.status = 'skipped'; result.code = 'STANDALONE_WORLDBOOK_NOT_SELECTED';
          continue;
        }
        if (seen.has(result.sha256)) { result.status = 'duplicate'; continue; }
        if (database && owner) {
          if (prepared.kind === 'character') {
            const created = await createCharacterWithWorldbook(database, {
              ...prepared.input, creatorId: owner.id, tenantId: owner.tenantId, isPublic: false,
            });
            result.id = created.id;
          } else {
            const created = await importStandaloneWorldbook(database, { userId: owner.id, tenantId: owner.tenantId }, prepared.original);
            result.id = created.worldBookId;
          }
        }
        result.status = options.dryRun ? 'ready' : 'imported';
        seen.add(result.sha256);
      } catch (error) {
        result.code = error instanceof CharacterCardImportError ? error.code
          : error instanceof Error && error.name === 'ZodError' ? 'INVALID_FIELDS'
          : options.dryRun ? 'FILE_READ_FAILED' : 'FILE_READ_OR_WRITE_FAILED';
      }
    }
    const count = (status: FileResult['status']) => results.filter(result => result.status === status).length;
    return { version: 1, mode: options.dryRun ? 'dry-run' : 'live', embeddedWorldbooks: 'atomic', includeStandaloneWorldbooks: options.includeWorldbooks,
      summary: { total: results.length, ready: count('ready'), imported: count('imported'), failed: count('failed'), duplicate: count('duplicate'), skipped: count('skipped') },
      results };
  } finally { await connection?.end({ timeout: 5 }); }
}

async function main() {
  const { values } = parseArgs({ options: {
    dir: { type: 'string' }, email: { type: 'string' }, 'dry-run': { type: 'boolean' },
    'include-worldbooks': { type: 'boolean' }, 'skip-worldbooks': { type: 'boolean' },
    report: { type: 'string' }, help: { type: 'boolean' },
  }, strict: true });
  if (values.help) {
    console.log('Usage: npx tsx scripts/import-cards.ts --dir <directory> --dry-run [--report <new-file-outside-source>]\nLive: --dir <directory> --email <existing-owner> [--include-worldbooks] [--report <new-file-outside-source>]\nStandalone world books are skipped by default. --include-worldbooks imports them unbound with the existing global scope. Embedded books always belong to the card transaction.\n--skip-worldbooks and --batch-size have been removed: embedded settings cannot be skipped and each file is atomic.\nOnly exact file-byte duplicates within this run are skipped. Rerunning may create new records. Partial failure returns exit code 2; dry-run never connects to the database.');
    return;
  }
  if (!values.dir || (!values['dry-run'] && !values.email) || values['skip-worldbooks']) {
    throw new Error('INVALID_ARGUMENTS');
  }
  if (values.report) {
    const destination = relative(resolve(values.dir), resolve(values.report));
    if (!destination.startsWith('..' + '/') && destination !== '..') throw new Error('REPORT_MUST_BE_OUTSIDE_SOURCE');
    await writeFile(values.report, '', { flag: 'wx', mode: 0o600 });
  }
  const report = await runImport({ directory: values.dir, email: values.email, dryRun: Boolean(values['dry-run']), includeWorldbooks: Boolean(values['include-worldbooks']) });
  if (values.report) await writeFile(values.report, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report));
  if (report.summary.failed > 0) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const known = ['INVALID_ARGUMENTS', 'IMPORT_CONFIGURATION_REQUIRED', 'IMPORT_OWNER_NOT_FOUND', 'REPORT_MUST_BE_OUTSIDE_SOURCE'];
    const code = error instanceof Error && known.includes(error.message) ? error.message : 'IMPORT_FAILED';
    console.error(JSON.stringify({ error: code, hint: 'Check --help, directory/report access and database configuration. No successful import summary was produced.' }));
    process.exitCode = 1;
  });
}
