#!/usr/bin/env python3
"""
Reorganize chat.service.ts to optimize Token Strength Hierarchy
Moves Memory and Emotion injection closer to generation point
"""

import re

# Read the file
with open('src/server/services/chat.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the buildEnhancedSystemPrompt method
method_start = content.find('async buildEnhancedSystemPrompt(params: EnhancedPromptParams)')
if method_start == -1:
    print("Error: Could not find buildEnhancedSystemPrompt method")
    exit(1)

# Find the end of the method (next method or closing brace)
method_end = content.find('\n  /**\n   * Check message count', method_start)
if method_end == -1:
    print("Error: Could not find method end")
    exit(1)

method_content = content[method_start:method_end]

# Extract Memory retrieval block (lines 332-394)
memory_pattern = r'(    // Retrieve relevant memories.*?)(    // Inject world info: EMTop position)'
memory_match = re.search(memory_pattern, method_content, re.DOTALL)
if not memory_match:
    print("Error: Could not find memory block")
    exit(1)

memory_block = memory_match.group(1)

# Extract Emotion block (lines 401-429)
emotion_pattern = r'(    // Get current emotion.*?)(    // Inject world info: EMBottom position)'
emotion_match = re.search(emotion_pattern, method_content, re.DOTALL)
if not emotion_match:
    print("Error: Could not find emotion block")
    exit(1)

emotion_block = emotion_match.group(1)

# Remove old blocks
method_content = method_content.replace(memory_block, '')
method_content = method_content.replace(emotion_block, '')

# Find insertion point (after Behavior guidelines, before ANBottom)
insertion_pattern = r"(    parts\.push\('Stay in character at all times\.'\);)\n\n(    // Inject world info: ANBottom position)"
insertion_match = re.search(insertion_pattern, method_content)
if not insertion_match:
    print("Error: Could not find insertion point")
    exit(1)

# Insert blocks at new location
new_content = method_content.replace(
    insertion_match.group(0),
    insertion_match.group(1) + '\n\n' + memory_block + '\n' + emotion_block + '\n' + insertion_match.group(2)
)

# Reconstruct full file
new_file_content = content[:method_start] + new_content + content[method_end:]

# Write back
with open('src/server/services/chat.service.ts', 'w', encoding='utf-8') as f:
    f.write(new_file_content)

print("✅ Successfully reorganized Token Strength Hierarchy")
print("Memory and Emotion blocks moved to higher priority position")
