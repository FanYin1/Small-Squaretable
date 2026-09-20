#!/usr/bin/env npx tsx
/**
 * Batch Import Script for SillyTavern Character Cards & World Books
 *
 * Usage:
 *   npx tsx scripts/import-cards.ts --dir "/mnt/e/Download/26.1角色卡" --email user@example.com
 *   npx tsx scripts/import-cards.ts --dir "/mnt/e/Download/26.1角色卡" --dry-run
 *   npx tsx scripts/import-cards.ts --dir "/mnt/e/Download/26.1角色卡" --email user@example.com --skip-worldbooks
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import { readFile, readdir } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import sharp from 'sharp';

// Import schema directly (avoid loading full app config which requires Redis etc.)
import { characters } from '../src/db/schema/characters';
import { users } from '../src/db/schema/users';
import { worldbooks, worldbookEntries } from '../src/db/schema/worldbooks';

// --- CLI Args ---
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}
const hasFlag = (name: string) => args.includes(`--${name}`);

const DIR = getArg('dir');
const EMAIL = getArg('email');
const DRY_RUN = hasFlag('dry-run');
const SKIP_WORLDBOOKS = hasFlag('skip-worldbooks');
const BATCH_SIZE = Number(getArg('batch-size') || '50');

if (!DIR) {
  console.error('Usage: npx tsx scripts/import-cards.ts --dir <path> [--email <email>] [--dry-run]');
  process.exit(1);
}
if (!DRY_RUN && !EMAIL) {
  console.error('--email is required unless using --dry-run');
  process.exit(1);
}

// --- DB Connection (lazy, only when not dry-run) ---
const DATABASE_URL = process.env.DATABASE_URL;
if (!DRY_RUN && !DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

let sql: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!db) {
    sql = postgres(DATABASE_URL!, { max: 5, idle_timeout: 20, connect_timeout: 10 });
    db = drizzle(sql);
  }
  return db;
}

// --- PNG Parsing ---
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function extractCharaFromPng(buffer: Buffer): { cardData: object; name: string; description: string; tags: string[] } | null {
  if (buffer.length < 8 || buffer.subarray(0, 8).compare(PNG_SIG) !== 0) return null;

  let pos = 8;
  while (pos + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(pos);
    const chunkType = buffer.subarray(pos + 4, pos + 8).toString('ascii');

    if (chunkType === 'tEXt' || chunkType === 'iTXt') {
      const chunkData = buffer.subarray(pos + 8, pos + 8 + chunkLength);
      const nullIdx = chunkData.indexOf(0);
      if (nullIdx > 0) {
        const keyword = chunkData.subarray(0, nullIdx).toString('ascii');
        if (keyword === 'chara') {
          const base64Data = chunkData.subarray(nullIdx + 1).toString('ascii');
          const jsonStr = Buffer.from(base64Data, 'base64').toString('utf-8');
          const parsed = JSON.parse(jsonStr);
          const data = parsed.data || parsed;
          return {
            cardData: parsed,
            name: data.name || parsed.name || '',
            description: data.description || parsed.description || '',
            tags: data.tags || parsed.tags || [],
          };
        }
      }
    }
    if (chunkType === 'IEND') break;
    pos += 12 + chunkLength;
  }
  return null;
}

// --- Thumbnail Generation ---
async function generateThumbnail(pngBuffer: Buffer): Promise<string> {
  const thumb = await sharp(pngBuffer)
    .resize(200, 200, { fit: 'cover' })
    .webp({ quality: 75 })
    .toBuffer();
  return `data:image/webp;base64,${thumb.toString('base64')}`;
}

// --- Dedup Hash ---
function dedupKey(name: string, description: string): string {
  return createHash('md5').update(`${name}||${description}`).digest('hex');
}

// --- Category Extraction ---
function extractCategory(filePath: string, baseDir: string): string | null {
  const rel = filePath.replace(resolve(baseDir), '').replace(/^[/\\]/, '');
  const parts = rel.split(/[/\\]/);
  // Skip the top-level collection dirs, use the deepest meaningful directory
  // e.g. "已分类/修仙/card.png" → "修仙"
  if (parts.length >= 2) {
    return parts[parts.length - 2]; // parent directory of the file
  }
  return null;
}

// --- World Book Entry Mapping ---
const POSITION_MAP: Record<number, string> = {
  0: 'before', 1: 'after', 2: 'EMTop', 3: 'EMBottom',
  4: 'atDepth', 5: 'ANTop', 6: 'ANBottom',
};
const SELECTIVE_LOGIC_MAP: Record<number, string> = {
  0: 'AND_ANY', 1: 'AND_ALL', 2: 'NOT_ANY', 3: 'NOT_ALL',
};

function mapWorldBookEntries(entries: Record<string, any>, worldbookId: string) {
  const rows: Array<typeof worldbookEntries.$inferInsert> = [];
  for (const key of Object.keys(entries).sort((a, b) => Number(a) - Number(b))) {
    const e = entries[key];
    if (!e || typeof e !== 'object') continue;
    const keys: string[] = Array.isArray(e.keys) ? e.keys : [];
    rows.push({
      worldbookId,
      keyword: keys.join(',') || 'unnamed',
      content: typeof e.content === 'string' ? e.content : '',
      position: typeof e.insertion_order === 'number' ? e.insertion_order : 0,
      isEnabled: e.enabled !== false,
      priority: typeof e.depth === 'number' ? e.depth : 0,
      settings: {
        keys,
        keysSecondary: Array.isArray(e.secondary_keys) ? e.secondary_keys : undefined,
        selectiveLogic: SELECTIVE_LOGIC_MAP[e.selectiveLogic] ?? 'AND_ANY',
        comment: typeof e.comment === 'string' ? e.comment : null,
        position: POSITION_MAP[e.position] ?? 'before',
        depth: typeof e.depth === 'number' ? e.depth : 4,
        order: typeof e.insertion_order === 'number' ? e.insertion_order : 100,
        constant: e.constant === true,
        probability: typeof e.probability === 'number' ? e.probability : 100,
        sticky: typeof e.sticky === 'number' ? e.sticky : 0,
        cooldown: typeof e.cooldown === 'number' ? e.cooldown : 0,
        delay: typeof e.delay === 'number' ? e.delay : 0,
        caseSensitive: e.case_sensitive === true,
        matchWholeWords: e.match_whole_words === true,
        preventRecursion: e.prevent_recursion === true,
        excludeRecursion: e.exclude_recursion === true,
      },
    });
  }
  return rows;
}

// --- File Scanner ---
async function scanFiles(dir: string): Promise<{ pngs: string[]; jsons: string[] }> {
  const pngs: string[] = [];
  const jsons: string[] = [];

  async function walk(d: string) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (ext === '.png') pngs.push(full);
        else if (ext === '.json') jsons.push(full);
      }
    }
  }

  await walk(dir);
  return { pngs, jsons };
}

// --- Standalone World Book Detection ---
function isWorldBookJson(data: any): boolean {
  // SillyTavern world book: has entries dict at top level
  if (data && typeof data === 'object' && data.entries && typeof data.entries === 'object') {
    // Make sure it's not a character card (which has data.name, data.description etc.)
    if (!data.data && !data.char_name && !data.first_mes) return true;
  }
  return false;
}

// --- Main ---
async function main() {
  console.log(`\n=== SillyTavern Batch Import ===`);
  console.log(`Directory: ${DIR}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`Batch size: ${BATCH_SIZE}\n`);

  // Scan files
  console.log('Scanning files...');
  const { pngs, jsons } = await scanFiles(DIR!);
  console.log(`Found ${pngs.length} PNG files, ${jsons.length} JSON files\n`);

  // Look up user
  let userId: string | undefined;
  let tenantId: string | undefined;
  if (!DRY_RUN) {
    const [user] = await getDb().select().from(users).where(eq(users.email, EMAIL!)).limit(1);
    if (!user) {
      console.error(`User not found: ${EMAIL}`);
      process.exit(1);
    }
    userId = user.id;
    tenantId = user.tenantId;
    console.log(`User: ${user.displayName || user.email} (${userId})`);
    console.log(`Tenant: ${tenantId}\n`);
  }

  // Stats
  const stats = {
    cardsProcessed: 0,
    cardsInserted: 0,
    cardsFailed: 0,
    cardsDuplicate: 0,
    worldbooksFromCards: 0,
    standaloneWorldbooks: 0,
    worldbookEntries: 0,
  };
  const seenHashes = new Set<string>();
  const failures: Array<{ file: string; error: string }> = [];

  // --- Process PNG character cards ---
  console.log('--- Processing PNG character cards ---');
  const cardBatch: Array<typeof characters.$inferInsert> = [];
  // Track cards that have character_book for worldbook creation after insert
  const cardWorldBooks: Array<{ cardIndex: number; characterBook: any; name: string }> = [];

  for (let i = 0; i < pngs.length; i++) {
    const filePath = pngs[i];
    const fileName = basename(filePath);
    stats.cardsProcessed++;

    try {
      const buffer = await readFile(filePath);
      const result = extractCharaFromPng(buffer);
      if (!result) {
        stats.cardsFailed++;
        failures.push({ file: fileName, error: 'No chara data in PNG' });
        continue;
      }

      // Dedup
      const hash = dedupKey(result.name, result.description);
      if (seenHashes.has(hash)) {
        stats.cardsDuplicate++;
        continue;
      }
      seenHashes.add(hash);

      // Generate thumbnail
      let avatarUrl: string | undefined;
      try {
        avatarUrl = await generateThumbnail(buffer);
      } catch {
        // If thumbnail fails, store a smaller version or skip avatar
        avatarUrl = undefined;
      }

      const category = extractCategory(filePath, DIR!);
      const tags = [...(result.tags || [])];
      if (category && !tags.includes(category)) tags.push(category);

      const cardRow: typeof characters.$inferInsert = {
        tenantId: tenantId!,
        creatorId: userId!,
        name: result.name || fileName.replace('.png', ''),
        description: result.description || '',
        avatarUrl: avatarUrl || null,
        cardData: result.cardData,
        tags: tags.slice(0, 20),
        category: category || null,
        isPublic: false,
        isNsfw: false,
      };

      if (!DRY_RUN) {
        cardBatch.push(cardRow);

        // Check for embedded character_book
        const data = (result.cardData as any).data || result.cardData;
        if (!SKIP_WORLDBOOKS && data.character_book?.entries) {
          cardWorldBooks.push({
            cardIndex: cardBatch.length - 1,
            characterBook: data.character_book,
            name: result.name,
          });
        }

        // Flush batch
        if (cardBatch.length >= BATCH_SIZE) {
          const inserted = await getDb().insert(characters).values(cardBatch).returning({ id: characters.id });
          // Create worldbooks for cards in this batch
          for (const wb of cardWorldBooks) {
            if (wb.cardIndex < inserted.length) {
              await createCharacterWorldBook(inserted[wb.cardIndex].id, wb.characterBook, wb.name, userId!, tenantId!);
              stats.worldbooksFromCards++;
            }
          }
          stats.cardsInserted += inserted.length;
          cardBatch.length = 0;
          cardWorldBooks.length = 0;
        }
      } else {
        stats.cardsInserted++;
        // Count worldbooks in dry-run too
        const data = (result.cardData as any).data || result.cardData;
        if (!SKIP_WORLDBOOKS && data.character_book?.entries) {
          stats.worldbooksFromCards++;
          stats.worldbookEntries += Object.keys(data.character_book.entries).length;
        }
      }
    } catch (err: any) {
      stats.cardsFailed++;
      failures.push({ file: fileName, error: err.message || String(err) });
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  [${i + 1}/${pngs.length}] processed, ${stats.cardsInserted} inserted, ${stats.cardsDuplicate} dupes, ${stats.cardsFailed} failed`);
    }
  }

  // Flush remaining card batch
  if (!DRY_RUN && cardBatch.length > 0) {
    const inserted = await getDb().insert(characters).values(cardBatch).returning({ id: characters.id });
    for (const wb of cardWorldBooks) {
      if (wb.cardIndex < inserted.length) {
        await createCharacterWorldBook(inserted[wb.cardIndex].id, wb.characterBook, wb.name, userId!, tenantId!);
        stats.worldbooksFromCards++;
      }
    }
    stats.cardsInserted += inserted.length;
    cardBatch.length = 0;
    cardWorldBooks.length = 0;
  }

  console.log(`\nPNG cards done: ${stats.cardsInserted} inserted, ${stats.cardsDuplicate} duplicates, ${stats.cardsFailed} failed\n`);

  // --- Process standalone JSON world books ---
  if (!SKIP_WORLDBOOKS) {
    console.log('--- Processing standalone JSON world books ---');
    for (let i = 0; i < jsons.length; i++) {
      const filePath = jsons[i];
      const fileName = basename(filePath);
      try {
        const raw = await readFile(filePath, 'utf-8');
        const data = JSON.parse(raw);

        if (!isWorldBookJson(data)) continue; // Skip non-worldbook JSONs (could be character cards)

        const wbName = data.name || fileName.replace('.json', '');

        if (!DRY_RUN) {
          const [wb] = await getDb().insert(worldbooks).values({
            tenantId: tenantId!,
            userId: userId!,
            name: wbName,
            description: data.description || null,
            scope: 'global',
            isEnabled: true,
          }).returning({ id: worldbooks.id });

          const entryRows = mapWorldBookEntries(data.entries, wb.id);
          if (entryRows.length > 0) {
            for (let j = 0; j < entryRows.length; j += BATCH_SIZE) {
              await getDb().insert(worldbookEntries).values(entryRows.slice(j, j + BATCH_SIZE));
            }
            stats.worldbookEntries += entryRows.length;
          }
        }
        stats.standaloneWorldbooks++;
      } catch (err: any) {
        failures.push({ file: fileName, error: err.message || String(err) });
      }

      if ((i + 1) % 50 === 0) {
        console.log(`  [${i + 1}/${jsons.length}] JSON files processed`);
      }
    }
    console.log(`\nStandalone world books: ${stats.standaloneWorldbooks} imported\n`);
  }

  // --- Summary ---
  console.log('=== Import Summary ===');
  console.log(`Cards processed:       ${stats.cardsProcessed}`);
  console.log(`Cards inserted:        ${stats.cardsInserted}`);
  console.log(`Cards duplicate:       ${stats.cardsDuplicate}`);
  console.log(`Cards failed:          ${stats.cardsFailed}`);
  console.log(`World books (cards):   ${stats.worldbooksFromCards}`);
  console.log(`World books (standalone): ${stats.standaloneWorldbooks}`);
  console.log(`World book entries:    ${stats.worldbookEntries}`);

  if (failures.length > 0 && failures.length <= 20) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  ${f.file}: ${f.error}`);
    }
  } else if (failures.length > 20) {
    console.log(`\n${failures.length} failures (showing first 20):`);
    for (const f of failures.slice(0, 20)) {
      console.log(`  ${f.file}: ${f.error}`);
    }
  }

  // Cleanup
  if (sql) await sql.end();
  console.log('\nDone.');
}

// --- Helper: Create world book from character_book ---
async function createCharacterWorldBook(
  characterId: string,
  characterBook: any,
  charName: string,
  userId: string,
  tenantId: string,
) {
  const [wb] = await getDb().insert(worldbooks).values({
    tenantId,
    userId,
    characterId,
    name: characterBook.name || `${charName} - World Book`,
    description: characterBook.description || null,
    scope: 'character',
    isEnabled: true,
  }).returning({ id: worldbooks.id });

  const entryRows = mapWorldBookEntries(characterBook.entries, wb.id);
  if (entryRows.length > 0) {
    for (let j = 0; j < entryRows.length; j += BATCH_SIZE) {
      await getDb().insert(worldbookEntries).values(entryRows.slice(j, j + BATCH_SIZE));
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
