/**
 * Analyze how the conversation context is built
 */
import { db } from '../src/db/index';
import { messages } from '../src/db/schema/chats';
import { eq, asc } from 'drizzle-orm';

async function analyzeContext(chatId: string) {
  console.log(`\n🔍 Analyzing conversation context for chat: ${chatId}\n`);

  const chatMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.sentAt));

  console.log(`Total messages: ${chatMessages.length}\n`);
  console.log('='.repeat(80));
  console.log('CONVERSATION FLOW (as seen by LLM):');
  console.log('='.repeat(80));

  chatMessages.forEach((msg, i) => {
    console.log(`\n[${i + 1}] ${msg.role.toUpperCase()}`);
    console.log('-'.repeat(80));
    console.log(msg.content);
    console.log('-'.repeat(80));
  });

  console.log('\n' + '='.repeat(80));
  console.log('ANALYSIS:');
  console.log('='.repeat(80));

  if (chatMessages.length >= 2) {
    const firstMsg = chatMessages[0];
    const secondMsg = chatMessages[1];

    if (firstMsg.role === 'assistant') {
      console.log('\n✅ First message is from ASSISTANT (the greeting)');
      console.log('   This establishes the scene/context.');
      
      if (secondMsg.role === 'user') {
        console.log(`\n✅ Second message is from USER: "${secondMsg.content}"`);
        
        if (chatMessages.length >= 3) {
          const thirdMsg = chatMessages[2];
          console.log(`\n❌ PROBLEM: Third message (AI response) is:`);
          console.log(`   "${thirdMsg.content.substring(0, 150)}..."`);
          console.log('\n   The AI should continue the scene from the greeting,');
          console.log('   but instead it seems to ignore the greeting context.');
        }
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('EXPECTED BEHAVIOR:');
  console.log('='.repeat(80));
  console.log(`
The LLM receives this conversation history:
1. ASSISTANT: [Greeting with scene description]
2. USER: "开始"
3. ASSISTANT: [Should continue the scene...]

The AI should recognize that:
- Message #1 is its own previous message
- It established a specific scene/scenario
- It should continue that scene when responding to "开始"

POSSIBLE CAUSES:
1. System prompt doesn't emphasize continuing the established scene
2. Context window is too small and greeting is truncated
3. LLM doesn't understand it should maintain continuity
4. The greeting is not being included in the context properly
`);
}

const chatId = process.argv[2];
if (!chatId) {
  console.error('Usage: npx tsx scripts/analyze-conversation-context.ts <chatId>');
  process.exit(1);
}

analyzeContext(chatId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
