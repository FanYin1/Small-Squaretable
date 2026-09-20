/**
 * Check messages in a chat
 */
import { db } from '../src/db/index';
import { messages } from '../src/db/schema/chats';
import { eq, asc } from 'drizzle-orm';

async function checkMessages(chatId: string) {
  console.log(`\n🔍 Checking messages for chat: ${chatId}\n`);

  const chatMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.sentAt));

  console.log(`Total messages: ${chatMessages.length}\n`);

  if (chatMessages.length === 0) {
    console.log('❌ No messages found. The greeting was not persisted.');
    console.log('   This means the user has not sent any message yet.');
    console.log('   The greeting should appear in the UI but not be saved to DB until the user sends a message.');
    return;
  }

  chatMessages.forEach((msg, i) => {
    console.log(`Message ${i + 1}:`);
    console.log(`  Role: ${msg.role}`);
    console.log(`  Content: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
    console.log(`  Sent at: ${msg.sentAt}`);
    if (msg.characterId) {
      console.log(`  Character ID: ${msg.characterId}`);
    }
    console.log('');
  });
}

const chatId = process.argv[2];
if (!chatId) {
  console.error('Usage: npx tsx scripts/check-chat-messages.ts <chatId>');
  process.exit(1);
}

checkMessages(chatId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
