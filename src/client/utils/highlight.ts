/**
 * Search result highlight utility
 *
 * Wraps matched keywords with <mark> tags for visual highlighting.
 * All text is HTML-escaped before highlighting to prevent XSS attacks.
 */

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML special characters to prevent XSS attacks.
 *
 * @param str - The string to escape
 * @returns HTML-escaped string safe for v-html rendering
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Highlight matching keywords in text by wrapping them with <mark> tags.
 *
 * Splits the query by spaces into individual keywords, then wraps each
 * occurrence with `<mark class="search-highlight">...</mark>`.
 *
 * The input text is HTML-escaped BEFORE applying highlighting to prevent
 * XSS attacks when the result is rendered via v-html.
 *
 * @param text - The source text to highlight within
 * @param query - Space-separated keywords to highlight
 * @returns HTML string with matches wrapped in <mark> tags (safe for v-html)
 */
export function highlightText(text: string, query: string): string {
  if (!text || !query) return escapeHtml(text || '');

  const keywords = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegex);

  if (keywords.length === 0) return escapeHtml(text);

  // Escape HTML first to prevent XSS, then apply highlighting
  const escaped = escapeHtml(text);
  const pattern = new RegExp(`(${keywords.join('|')})`, 'gi');
  return escaped.replace(pattern, '<mark class="search-highlight">$1</mark>');
}
