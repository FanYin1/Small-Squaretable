/**
 * Quick check for recent chats and their character associations
 *
 * Usage: npx tsx scripts/check-recent-chats.ts [limit]
 */

import { db } from '../src/db/index';
import { chats } from '../src/db/schema/chats';
import { characters } from '../src/db/schema/characters';
import { chatCharacters } from '../src/db/schema/chat-characters';
import { desc, eq } from 'drizzle-orm';

async function checkRecentChats(limit = 2) {
  console.log(`\n🔍 Checking ${limit} most recent chats\n`);

  // Get recent chats
  const recentChats = await db
    .select()
    .from(chats)
    .orderBy(desc(chats.createdAt))
    .limit(limit);

  if (recentChats.length === 0) {
    console.log('No chats found');
    return;
  }

  for (let i = 0; i < recentChats.length; i++) {
    const chat = recentChats[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Chat ${i + 1}/${recentChats.length}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`ID: ${chat.id}`);
    console.log(`Title: ${chat.title || '(Untitled)'}`);
    console.log(`Created: ${chat.createdAt}`);
    console.log(`Character ID (legacy): ${chat.characterId || '(none)'}`);

    // Check chat_characters
    const chatChars = await db
      .select({
        characterId: chatCharacters.characterId,
        sortOrder: chatCharacters.sortOrder,
      })
      .from(chatCharacters)
      .where(eq(chatCharacters.chatId, chat.id));

    console.log(`\nCharacters in chat_characters table: ${chatChars.length}`);

    if (chatChars.length === 0 && chat.characterId) {
      console.log('⚠️  WARNING: No entries in chat_characters, but characterId is set');
      console.log('   Run: npx tsx scripts/fix-character-associations.ts');
    }

    // Get character details
    const characterIds = chatChars.length > 0
      ? chatChars.map(cc => cc.characterId)
      : chat.characterId
        ? [chat.characterId]
        : [];

    for (const charId of characterIds) {
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, charId));

      if (!character) {
        console.log(`\n❌ Character ${charId} not found in database!`);
        continue;
      }

      console.log(`\n📝 Character: ${character.name}`);
      console.log(`   ID: ${character.id}`);
      console.log(`   Avatar: ${character.avatarUrl ? '✅' : '❌'}`);

      const cardData = character.cardData as Record<string, any> | null;
      if (!cardData) {
        console.log(`   cardData: ❌ NULL`);
        continue;
      }

      console.log(`   cardData: ✅`);
      console.log(`     - name: ${cardData.name || '(missing)'}`);
      console.log(`     - description: ${cardData.description ? '✅' : '❌'}`);
      console.log(`     - personality: ${cardData.personality ? '✅' : '❌'}`);
      console.log(`     - scenario: ${cardData.scenario ? '✅' : '❌'}`);
      console.log(`     - first_mes: ${cardData.first_mes ? '✅' : '❌ MISSING'}`);

      if (cardData.first_mes) {
        const preview = cardData.first_mes.substring(0, 80);
        console.log(`       Preview: "${preview}${cardData.first_mes.length > 80 ? '...' : ''}"`);
      }

      if (cardData.alternate_greetings && Array.isArray(cardData.alternate_greetings)) {
        console.log(`     - alternate_greetings: ✅ ${cardData.alternate_greetings.length} greetings`);
      } else {
        console.log(`     - alternate_greetings: ❌`);
      }

      if (cardData.extensions) {
        const extKeys = Object.keys(cardData.extensions);
        if (extKeys.length > 0) {
          console.log(`     - extensions: ${extKeys.join(', ')}`);
        }
      }
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

const limit = parseInt(process.argv[2] || '2', 10);

checkRecentChats(limit)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
