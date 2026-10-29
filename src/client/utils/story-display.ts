import DOMPurify from 'dompurify';
import { createStoryMarkdown } from './story-markdown';
import { stripStoryControlBlocks } from '../../types/story-opening';
export { stripStoryControlBlocks } from '../../types/story-opening';

const markdown = createStoryMarkdown();

export function storyDisplayText(value: unknown, options: {
  characterName?: string; userName?: string; limit?: number; multiline?: boolean;
} = {}): string {
  if (typeof value !== 'string') return '';
  const content = stripStoryControlBlocks(value)
    .replace(/```(?:html)?\s*\n([\s\S]*?)```/gi, '$1');
  const html = markdown.parse(content, { async: false }).replace(/<\/(?:p|div|li|h[1-6]|section|article)>|<br\s*\/?>/gi, '\n');
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [], ALLOWED_ATTR: [], RETURN_DOM_FRAGMENT: true,
    FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'head'],
  });
  const text = (fragment.textContent ?? '')
    .replace(/\{\{(char|user)\}\}/gi, (_match, macro: string) => macro.toLowerCase() === 'char'
      ? options.characterName ?? '' : options.userName ?? 'you')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  const result = options.multiline ? text.replace(/\n{3,}/g, '\n\n') : text.replace(/\s+/g, ' ');
  const limit = options.limit ?? 200;
  return result.length > limit ? `${result.slice(0, limit)}…` : result;
}
