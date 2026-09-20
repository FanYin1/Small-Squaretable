/**
 * Fix character associations for chats
 *
 * This script ensures all chats have their characters properly linked in the chat_characters table.
 * Run this if you have chats created before the chat_characters table was introduced.
 *
 * Usage: npx tsx scripts/fix-character-associations.ts [--dry-run]
 */

import { db } from '../src/db/index';
import { chats } from '../src/db/schema/chats';
import { chatCharacters } from '../src/db/schema/chat-characters';
import { eq, and, isNotNull } from 'drizzle-orm';

async function fixAssociations(dryRun = false) {
  console.log(`\n🔧 Fixing character associations ${dryRun ? '(DRY RUN)' : ''}\n`);

  // Find all chats with a characterId
  const allChats = await db
    .select()
    .from(chats)
    .where(isNotNull(chats.characterId));

  console.log(`Found ${allChats.length} chats with characterId`);

  let fixed = 0;
  let alreadyOk = 0;

  for (const chat of allChats) {
    if (!chat.characterId) continue;

    // Check if already in chat_characters
    const existing = await db
      .select()
      .from(chatCharacters)
      .where(
        and(
          eq(chatCharacters.chatId, chat.id),
          eq(chatCharacters.characterId, chat.characterId)
        )
      );

    if (existing.length > 0) {
      alreadyOk++;
      continue;
    }

    // Need to insert
    console.log(`  Fixing chat ${chat.id} (${chat.title || 'Untitled'}) -> character ${chat.characterId}`);

    if (!dryRun) {
      await db
        .insert(chatCharacters)
        .values({
          chatId: chat.id,
          characterId: chat.characterId,
          sortOrder: 0,
        })
        .onConflictDoNothing();
    }

    fixed++;
  }

  console.log(`\n✅ Complete:`);
  console.log(`  - Already OK: ${alreadyOk}`);
  console.log(`  - Fixed: ${fixed}`);

  if (dryRun && fixed > 0) {
    console.log(`\n⚠️  This was a dry run. Run without --dry-run to apply fixes.`);
  }
}

const dryRun = process.argv.includes('--dry-run');

fixAssociations(dryRun)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
