/**
 * Token estimation utility
 *
 * Provides rough token count estimation for prompt management
 */

/**
 * Estimate the number of tokens in a text string.
 * Uses a simple heuristic: ~4 characters per token for English text.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}
