/**
 * Client-side regex_scripts engine for markdownOnly display transforms.
 * Mirrors the server-side logic in src/server/services/regex-scripts.service.ts
 * but runs only markdownOnly scripts during rendering.
 */

export interface RegexScript {
  id?: string | number;
  scriptName?: string;
  findRegex: string;
  replaceString: string;
  trimStrings?: string[];
  placement: number[];
  disabled?: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  runOnEdit?: boolean;
  substituteRegex?: boolean;
  minDepth?: number;
  maxDepth?: number;
}

function parseRegex(findRegex: string): RegExp {
  const slashMatch = findRegex.match(/^\/(.+)\/([gimsuy]*)$/s);
  if (slashMatch) {
    return new RegExp(slashMatch[1], slashMatch[2] || 'g');
  }
  return new RegExp(findRegex, 'gmi');
}

function applyTrimString(text: string, trim: string): string {
  const regexMatch = trim.match(/^\/(.+)\/([gimsuy]*)$/s);
  if (regexMatch) {
    try {
      const re = new RegExp(regexMatch[1], regexMatch[2] || 'g');
      return text.replace(re, '');
    } catch {
      return text;
    }
  }
  return text.split(trim).join('');
}

/**
 * Apply markdownOnly regex_scripts to text for display rendering.
 * Only processes scripts where markdownOnly=true and placement includes AI_OUTPUT (1).
 */
export function applyMarkdownOnlyScripts(
  text: string,
  scripts: RegexScript[] | undefined | null,
): string {
  if (!text || !scripts || !Array.isArray(scripts) || scripts.length === 0) {
    return text;
  }

  let result = text;

  for (const script of scripts) {
    if (script.disabled) continue;
    if (!script.markdownOnly) continue;
    if (!script.placement || !Array.isArray(script.placement)) continue;
    if (!script.placement.includes(1)) continue; // 1 = AI_OUTPUT
    if (script.promptOnly) continue;

    try {
      const regex = parseRegex(script.findRegex);
      result = result.replace(regex, script.replaceString ?? '');

      if (script.trimStrings && Array.isArray(script.trimStrings)) {
        for (const trim of script.trimStrings) {
          if (trim) {
            result = applyTrimString(result, trim);
          }
        }
      }
    } catch {
      // Skip broken scripts silently on client
    }
  }

  return result;
}

/**
 * Extract regex_scripts from character cardData.
 */
export function getRegexScripts(
  cardData: Record<string, unknown> | null | undefined,
): RegexScript[] {
  if (!cardData) return [];
  const extensions = cardData.extensions as Record<string, unknown> | undefined;
  if (!extensions) return [];
  const scripts = extensions.regex_scripts;
  if (!Array.isArray(scripts)) return [];
  return scripts as RegexScript[];
}
