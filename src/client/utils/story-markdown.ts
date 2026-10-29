import { Marked, type MarkedExtension } from 'marked';
import markedCjkFriendly from 'marked-cjk-friendly';

export function createStoryMarkdown(options: MarkedExtension = {}) {
  return new Marked(options, markedCjkFriendly());
}
