// This is a reference for the optimized order
// New order after optimization:

// 1. Character description (lowest priority)
parts.push(...defaultPromptParts);

// 2. Example dialogues
if (cardData.mes_example) {
  parts.push(exampleBlock);
}

// 3. World Info: before, EMTop
if (worldInfo?.before) parts.unshift(worldInfo.before);
if (worldInfo?.EMTop) parts.push(worldInfo.EMTop);

// 4. World Info: EMBottom, ANTop
if (worldInfo?.EMBottom) parts.push(worldInfo.EMBottom);
if (worldInfo?.ANTop) parts.push(worldInfo.ANTop);

// 5. Behavior guidelines (middle priority)
parts.push('\n## 行为指引');
parts.push('- 根据记忆中的信息个性化回复');
parts.push('- 保持情感状态的一致性，情感变化应自然过渡');
parts.push('- 可以主动提及相关记忆，但不要生硬');
parts.push('Stay in character at all times.');

// 6. Memory retrieval (MOVED HERE - higher priority)
const memories = await memoryService.retrieveMemories(...);
if (memories.length > 0) {
  parts.push('\n## 关于用户的记忆');
  // ... memory content
}

// 7. Emotion state (MOVED HERE - higher priority)
const emotion = await emotionService.getCurrentEmotion(...);
if (emotion) {
  parts.push(`\n## 当前情感状态`);
  // ... emotion content
}

// 8. World Info: ANBottom, after
if (worldInfo?.ANBottom) parts.push(worldInfo.ANBottom);
if (worldInfo?.after) parts.push(worldInfo.after);

// 9. atDepth entries (Author's Note at depth 0, highest priority)
// Handled separately in context building
