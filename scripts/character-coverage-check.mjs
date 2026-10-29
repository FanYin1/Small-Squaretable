import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const root = process.env.CARD_LIBRARY_SAMPLE_ROOT;
assert.ok(root, 'Set CARD_LIBRARY_SAMPLE_ROOT to the authorized local library');
const output = `/tmp/squaretable-03c-coverage-${randomUUID()}`;
await mkdir(output, { mode: 0o700 });
async function loadModule(file) {
  const bundle = await build({ entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
}
const { parseCharacterFile, importFromSillyTavern, MAX_CHARACTER_FILE_BYTES } = await loadModule('src/types/character-card-import.ts');
const { inspectStoryCapabilities } = await loadModule('src/types/story-capabilities.ts');
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const nonempty = value => Array.isArray(value) ? value.length > 0 : Object.keys(record(value)).length > 0;
const shape = (value, depth = 0) => {
  if (depth > 4) return 'bounded';
  if (Array.isArray(value)) return { type: 'array', length: value.length, items: value.slice(0, 3).map(item => shape(item, depth + 1)) };
  if (value && typeof value === 'object') {
    const allowed = ['scripts', 'type', 'value', 'content', 'code', 'enabled', 'disabled', 'name', 'id', 'children', 'folder', 'button', 'data'];
    return { type: 'object', fields: Object.fromEntries(Object.entries(value).filter(([key]) => allowed.includes(key)).map(([key, item]) => [key, shape(item, depth + 1)])), otherFieldCount: Object.keys(value).filter(key => !allowed.includes(key)).length };
  }
  return value === null ? 'null' : typeof value;
};
const required = ['legacy', 'v2', 'v3', 'embedded-book', 'named-book', 'alternate-openings', 'helper-scripts', 'helper-tuples', 'mvu', 'era', 'regex', 'author-html'];
const selected = new Map();
const privateSources = [];
const failures = [];
const counts = { inspectedFiles: 0, parsedCards: 0, parseRejected: 0, oversized: 0 };
const files = [];
async function collect(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (entry.isDirectory()) await collect(join(directory, entry.name));
    else if (entry.isFile() && /\.(png|json)$/i.test(entry.name)) files.push(join(directory, entry.name));
  }
}
await collect(root);
for (const file of files) {
  if (required.every(category => selected.has(category))) break;
  counts.inspectedFiles++;
  if ((await stat(file)).size > MAX_CHARACTER_FILE_BYTES) { counts.oversized++; continue; }
  const bytes = await readFile(file);
  let source;
  try { source = (await parseCharacterFile(bytes)).character.cardData._squaretableImport.original; } catch { counts.parseRejected++; continue; }
  counts.parsedCards++;
  if (counts.parsedCards % 250 === 0) console.info(JSON.stringify({ inspected: counts.inspectedFiles, covered: [...selected.keys()] }));
  const fields = ['chara_card_v2', 'chara_card_v3'].includes(source.spec) && source.data ? source.data : source;
  const extensions = record(fields.extensions);
  const text = [fields.first_mes, fields.description, fields.personality, fields.scenario, fields.system_prompt, fields.post_history_instructions,
    ...(fields.alternate_greetings ?? []), ...(fields.character_book?.entries ?? []).map(entry => entry.content)].filter(value => typeof value === 'string').join('\n');
  const categories = [];
  if (source.spec === 'chara_card_v2') categories.push('v2');
  else if (source.spec === 'chara_card_v3') categories.push('v3');
  else categories.push('legacy');
  if (fields.character_book?.entries?.length) categories.push('embedded-book');
  if (typeof extensions.world === 'string' && extensions.world.trim()) categories.push('named-book');
  if (fields.alternate_greetings?.length) categories.push('alternate-openings');
  if (nonempty(extensions.TavernHelper_scripts)) categories.push('helper-scripts');
  if (Array.isArray(extensions.tavern_helper) && extensions.tavern_helper.some(item => Array.isArray(item) && item[0] === 'scripts' && nonempty(item[1]))) categories.push('helper-tuples');
  if (/<UpdateVariable>|\bMVU\b/i.test(text)) categories.push('mvu');
  if (/era:|<Variable(?:Insert|Update|Delete)>/i.test(text)) categories.push('era');
  if (Array.isArray(extensions.regex_scripts) && extensions.regex_scripts.some(script => script.disabled !== true)) categories.push('regex');
  if (/<script\b|\bon[a-z]+\s*=/i.test(text)) categories.push('author-html');
  const needed = categories.filter(category => !selected.has(category));
  if (!needed.length) continue;
  const digest = createHash('sha256').update(bytes).digest('hex');
  privateSources.push({ path: file, sha256: digest, categories: needed });
  const before = JSON.stringify(source);
  const normalized = importFromSillyTavern(source).cardData;
  const capability = inspectStoryCapabilities(normalized);
  const checks = [];
  function verify(label, callback) {
    try { callback(); checks.push(label); } catch { failures.push({ sha256: digest, categories: needed, assertion: label }); }
  }
  verify('selected original object preserved', () => assert.deepEqual(normalized._squaretableImport.original, source));
  verify('diagnosis does not mutate original data', () => assert.equal(JSON.stringify(source), before));
  verify('canonical source fields and imported capability reports agree', () => assert.deepEqual(inspectStoryCapabilities(fields), capability));
  if (needed.some(category => ['helper-scripts', 'helper-tuples', 'author-html'].includes(category))) verify('author execution dependencies are diagnosed', () => assert.ok(capability.issues.includes('author_scripts')));
  if (needed.some(category => ['mvu', 'era'].includes(category))) verify('variable framework is not silently treated as native state', () => { assert.ok(capability.issues.includes('variable_framework')); assert.equal(capability.native, false); });
  if (needed.includes('regex')) verify('active regex dependency is diagnosed', () => assert.ok(capability.issues.includes('regex_rules')));
  const sample = { sha256: digest, format: source.spec ?? 'legacy', bytes: bytes.length, categories: needed, checks, capability,
    structures: { helperScripts: shape(extensions.TavernHelper_scripts), helper: shape(extensions.tavern_helper), embeddedEntries: fields.character_book?.entries?.length ?? 0, alternateOpenings: fields.alternate_greetings?.length ?? 0 },
    source: 'authorized external original; read-only production parser and normalization; no author execution or model call' };
  for (const category of needed) selected.set(category, sample);
}
const missing = required.filter(category => !selected.has(category));
const sources = [];
for (const file of ['scripts/character-coverage-check.mjs', 'src/types/character-card-import.ts', 'src/types/card-fields.ts', 'src/types/story-capabilities.ts']) sources.push({ path: file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
const report = { date: new Date().toISOString(), result: missing.length || failures.length ? 'failed' : 'passed', task: 'EXP-03C R1',
  selection: 'deterministic first matching structures, stopping once required categories have examples; not a prevalence or full-library compatibility estimate',
  counts, matrix: required.map(category => ({ category, sha256: selected.get(category)?.sha256 ?? null })), samples: [...new Set(selected.values())], failures, missing, sources,
  limits: ['Static parsing, preservation and diagnostic coverage only', 'Original scripts never executed; game semantics and multi-character runtime are checked separately', 'Existing standalone-book and format/compression integration evidence remains separate'], paidProviderTokens: 0 };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
await writeFile(join(output, 'selection.json'), JSON.stringify(privateSources, null, 2), { mode: 0o600 });
console.info(JSON.stringify({ result: report.result, counts, selected: report.samples.length, failures, missing, report: join(output, 'report.json') }, null, 2));
if (report.result !== 'passed') process.exitCode = 1;
