/**
 * Extract @mentions from text content.
 * Matches @username patterns (alphanumeric + underscores).
 */
export function parseMentions(text: string): string[] {
  if (!text) return [];
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return [...new Set(mentions)]; // deduplicate
}
