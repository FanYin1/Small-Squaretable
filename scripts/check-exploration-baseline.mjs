import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'docs/design/exploration-baseline/manifest.json'), 'utf8'));
const compareCurrent = process.argv.includes('--compare-current');
if (manifest.version !== 1 || !Array.isArray(manifest.artifacts) || !Array.isArray(manifest.sources)) {
  throw new Error('Invalid exploration reference manifest');
}
const entries = [...manifest.artifacts, ...(compareCurrent ? manifest.sources : [])];
const failures = [];
for (const entry of entries) {
  const path = resolve(root, entry.path);
  if (!path.startsWith(`${root}${sep}`) || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error('Invalid reference path or digest');
  }
  try {
    const digest = createHash('sha256').update(await readFile(path)).digest('hex');
    if (digest !== entry.sha256) failures.push(`Changed: ${entry.path}`);
  } catch {
    failures.push(`Missing or unreadable: ${entry.path}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  console.error('Review the differences and record an intentional reference update; do not overwrite current work from the snapshot.');
  process.exitCode = 1;
} else {
  console.info(`PASS: ${manifest.artifacts.length} saved reference artifacts${compareCurrent ? ` and ${manifest.sources.length} current source files` : ''}. This checks file integrity, not product acceptance.`);
}
