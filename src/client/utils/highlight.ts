/**
 * Search result highlight utility
 *
 * Wraps matched keywords with <mark> tags for visual highlighting.
 */

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlight matching keywords in text by wrapping them with <mark> tags.
 *
 * Splits the query by spaces into individual keywords, then wraps each
 * occurrence with `<mark class="search-highlight">...</mark>`.
 *
 * @param text - The source text to highlight within
 * @param query - Space-separated keywords to highlight
 * @returns HTML string with matches wrapped in <mark> tags
 */
export function highlightText(text: string, query: string): string {
  if (!text || !query) return text || '';

  const keywords = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegex);

  if (keywords.length === 0) return text;

  const pattern = new RegExp(`(${keywords.join('|')})`, 'gi');
  return text.replace(pattern, '<mark class="search-highlight">$1</mark>');
}
