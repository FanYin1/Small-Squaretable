/**
 * Token estimation utility
 *
 * Provides token count estimation for prompt management.
 * Uses a CJK-aware algorithm that handles multilingual text
 * more accurately than a simple text.length/4 heuristic.
 */

// CJK Unified Ideographs + Extension A/B + CJK Symbols + Fullwidth Forms
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u3000-\u303f\uff00-\uffef]/gu;

/**
 * Improved token estimation without external dependencies.
 * More accurate than text.length/4 by handling CJK and English differently.
 *
 * - CJK characters: each is roughly 1-2 tokens (we use 1.5 average)
 * - English/Latin words: each word is roughly 1.3 tokens on average
 * - Punctuation and special chars are counted as part of adjacent words
 */
export function countTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;

  // CJK characters: each is roughly 1-2 tokens
  const cjkChars = text.match(CJK_REGEX);
  const cjkCount = cjkChars ? cjkChars.length : 0;
  tokens += Math.ceil(cjkCount * 1.5);

  // Remove CJK chars to count remaining (Latin/etc)
  const nonCjk = text.replace(CJK_REGEX, ' ');

  // English/Latin: split by whitespace, each word ≈ 1.3 tokens
  const words = nonCjk.split(/\s+/).filter(w => w.length > 0);
  tokens += Math.ceil(words.length * 1.3);

  return Math.max(1, tokens);
}

/**
 * Count tokens for an array of LLM messages.
 * Adds per-message overhead for role/formatting.
 */
export function countMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  const MESSAGE_OVERHEAD = 4; // ~4 tokens per message for role/formatting
  let total = 0;
  for (const msg of messages) {
    total += countTokens(msg.content) + MESSAGE_OVERHEAD;
  }
  total += 2; // conversation start/end overhead
  return total;
}

/**
 * Backwards-compatible alias for countTokens.
 * @deprecated Use countTokens instead.
 */
export function estimateTokens(text: string): number {
  return countTokens(text);
}
