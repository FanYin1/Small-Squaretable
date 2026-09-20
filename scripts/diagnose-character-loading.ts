/**
 * Diagnostic script to check character card loading issues
 *
 * Usage: npx tsx scripts/diagnose-character-loading.ts <chatId>
 */

import { db } from '../src/db/index';
import { chats } from '../src/db/schema/chats';
import { characters } from '../src/db/schema/characters';
import { chatCharacters } from '../src/db/schema/chat-characters';
import { eq } from 'drizzle-orm';

async function diagnose(chatId: string) {
  console.log(`\n🔍 Diagnosing chat: ${chatId}\n`);

  // 1. Check chat exists
  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
  if (!chat) {
    console.error('❌ Chat not found');
    return;
  }
  console.log('✅ Chat found:', {
    id: chat.id,
    characterId: chat.characterId,
    title: chat.title,
  });

  // 2. Check chat_characters table
  const chatChars = await db
    .select()
    .from(chatCharacters)
    .where(eq(chatCharacters.chatId, chatId));

  console.log(`\n📋 chat_characters entries: ${chatChars.length}`);
  chatChars.forEach((cc, i) => {
    console.log(`  ${i + 1}. characterId: ${cc.characterId}, sortOrder: ${cc.sortOrder}`);
  });

  // 3. Check character details
  if (chat.characterId) {
    const [character] = await db
      .select()
      .from(characters)
      .where(eq(characters.id, chat.characterId));

    if (!character) {
      console.error('\n❌ Character not found in database');
    } else {
      console.log('\n✅ Character found:', {
        id: character.id,
        name: character.name,
        hasAvatar: !!character.avatarUrl,
        hasCardData: !!character.cardData,
      });

      // 4. Check cardData structure
      if (character.cardData) {
        const cardData = character.cardData as Record<string, any>;
        console.log('\n📝 cardData structure:');
        console.log('  - name:', cardData.name || '(missing)');
        console.log('  - description:', cardData.description ? `${cardData.description.substring(0, 50)}...` : '(missing)');
        console.log('  - personality:', cardData.personality ? `${cardData.personality.substring(0, 50)}...` : '(missing)');
        console.log('  - scenario:', cardData.scenario ? `${cardData.scenario.substring(0, 50)}...` : '(missing)');
        console.log('  - first_mes:', cardData.first_mes ? `${cardData.first_mes.substring(0, 50)}...` : '❌ (missing)');
        console.log('  - mes_example:', cardData.mes_example ? 'present' : '(missing)');
        console.log('  - alternate_greetings:', Array.isArray(cardData.alternate_greetings) ? `${cardData.alternate_greetings.length} greetings` : '(missing)');

        if (cardData.extensions) {
          console.log('  - extensions:', Object.keys(cardData.extensions).join(', '));
        }
      } else {
        console.error('\n❌ cardData is null or empty');
      }
    }
  }

  // 5. Check if character is in chat_characters
  if (chat.characterId && chatChars.length === 0) {
    console.warn('\n⚠️  WARNING: Character is set in chat.characterId but not in chat_characters table');
    console.log('   This might cause loading issues. Run migration to fix:');
    console.log(`   INSERT INTO chat_characters (chat_id, character_id, sort_order) VALUES ('${chatId}', '${chat.characterId}', 0);`);
  }

  console.log('\n✅ Diagnosis complete\n');
}

const chatId = process.argv[2];
if (!chatId) {
  console.error('Usage: npx tsx scripts/diagnose-character-loading.ts <chatId>');
  process.exit(1);
}

diagnose(chatId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
