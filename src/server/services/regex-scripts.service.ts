/**
 * Regex Scripts Service
 *
 * SillyTavern 兼容的 regex_scripts 后处理引擎
 * 对 LLM 输出应用角色卡中定义的正则替换规则
 */

import { logger } from './logger.service';

const rsLogger = logger.child({ module: 'regex-scripts' });

/**
 * SillyTavern regex_scripts entry structure
 */
export interface RegexScript {
  id?: string | number;
  scriptName?: string;
  findRegex: string;
  replaceString: string;
  trimStrings?: string[];
  /** 1 = AI output, 2 = user input, 3 = slash command, 0 = disabled */
  placement: number[];
  disabled?: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  runOnEdit?: boolean;
  substituteRegex?: boolean;
  minDepth?: number;
  maxDepth?: number;
}

export enum RegexPlacement {
  AI_OUTPUT = 1,
  USER_INPUT = 2,
  SLASH_COMMAND = 3,
}

/**
 * Parse a findRegex string that may be in /pattern/flags format or plain pattern.
 * SillyTavern cards use both formats.
 */
function parseRegex(findRegex: string): RegExp {
  // Check for /pattern/flags format
  const slashMatch = findRegex.match(/^\/(.+)\/([gimsuy]*)$/s);
  if (slashMatch) {
    return new RegExp(slashMatch[1], slashMatch[2] || 'g');
  }
  // Plain pattern — apply default flags
  return new RegExp(findRegex, 'gmi');
}

/**
 * Apply a single trimString. Supports both literal strings and /regex/flags format.
 */
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
 * Apply regex_scripts to text based on placement filter.
 *
 * @param text - The text to process
 * @param scripts - Array of regex script definitions from cardData.extensions.regex_scripts
 * @param placement - Which placement to filter for (1=AI output, 2=user input)
 * @param markdownOnlyFilter - If set, only apply scripts matching this markdownOnly value
 * @returns Processed text
 */
export function applyRegexScripts(
  text: string,
  scripts: RegexScript[] | undefined | null,
  placement: RegexPlacement,
  markdownOnlyFilter?: boolean,
): string {
  if (!text || !scripts || !Array.isArray(scripts) || scripts.length === 0) {
    return text;
  }

  let result = text;

  for (const script of scripts) {
    if (script.disabled) continue;
    if (!script.placement || !Array.isArray(script.placement)) continue;
    if (!script.placement.includes(placement)) continue;
    if (script.promptOnly) continue;

    // Filter by markdownOnly when specified
    if (markdownOnlyFilter !== undefined) {
      const isMarkdownOnly = script.markdownOnly ?? false;
      if (isMarkdownOnly !== markdownOnlyFilter) continue;
    }

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
    } catch (err) {
      rsLogger.warn('Failed to apply regex script', {
        scriptName: script.scriptName,
        findRegex: script.findRegex,
        error: (err as Error).message,
      });
    }
  }

  return result;
}

/**
 * Extract regex_scripts from character cardData extensions.
 */
export function getRegexScripts(cardData: Record<string, unknown> | null | undefined): RegexScript[] {
  if (!cardData) return [];
  const extensions = cardData.extensions as Record<string, unknown> | undefined;
  if (!extensions) return [];
  const scripts = extensions.regex_scripts;
  if (!Array.isArray(scripts)) return [];
  return scripts as RegexScript[];
}
