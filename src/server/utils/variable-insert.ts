/**
 * VariableInsert Parser
 *
 * Extracts variables from ERA framework's <VariableInsert>{ json }</VariableInsert> blocks.
 * Flattens nested objects into dot-notation key-value pairs for chat variable storage.
 */

const VARIABLE_INSERT_RE = /<VariableInsert>([\s\S]*?)<\/VariableInsert>/gi;

export interface ExtractedVariable {
  key: string;
  value: string;
}

/**
 * Flatten a nested object into dot-notation key-value pairs.
 * Arrays are stored as JSON strings.
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): ExtractedVariable[] {
  const result: ExtractedVariable[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result.push({ key: fullKey, value: typeof value === 'string' ? value : JSON.stringify(value) });
    }
  }
  return result;
}

/**
 * Extract all <VariableInsert> blocks from text and return flattened key-value pairs.
 */
export function extractVariableInserts(text: string): ExtractedVariable[] {
  const variables: ExtractedVariable[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  VARIABLE_INSERT_RE.lastIndex = 0;

  while ((match = VARIABLE_INSERT_RE.exec(text)) !== null) {
    const jsonStr = match[1].trim();
    if (!jsonStr) continue;

    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        variables.push(...flattenObject(parsed));
      }
    } catch {
      // Malformed JSON — skip this block silently
    }
  }

  return variables;
}

/**
 * ERA XML tags to strip from display output.
 * These are functional tags that should not be rendered to the user.
 */
const ERA_XML_STRIP_RE = /<\/?(?:VariableInsert|VariableEdit|VariableDelete|era_data|variablethink)(?:\s[^>]*)?>[\s\S]*?<\/(?:VariableInsert|VariableEdit|VariableDelete|era_data|variablethink)>|<(?:VariableInsert|VariableEdit|VariableDelete|era_data|variablethink)(?:\s[^>]*)?\/>/gi;

/**
 * Strip ERA XML blocks from text for display purposes.
 */
export function stripEraXmlTags(text: string): string {
  return text.replace(ERA_XML_STRIP_RE, '').trim();
}

// --- VariableEdit ---

const VARIABLE_EDIT_RE = /<VariableEdit>([\s\S]*?)<\/VariableEdit>/gi;

/**
 * Extract all <VariableEdit> blocks — same format as VariableInsert (JSON key-value updates).
 */
export function extractVariableEdits(text: string): ExtractedVariable[] {
  const variables: ExtractedVariable[] = [];
  let match: RegExpExecArray | null;
  VARIABLE_EDIT_RE.lastIndex = 0;

  while ((match = VARIABLE_EDIT_RE.exec(text)) !== null) {
    const jsonStr = match[1].trim();
    if (!jsonStr) continue;
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        variables.push(...flattenObject(parsed));
      }
    } catch {
      // Malformed JSON — skip
    }
  }
  return variables;
}

// --- VariableDelete ---

const VARIABLE_DELETE_RE = /<VariableDelete>([\s\S]*?)<\/VariableDelete>/gi;

/**
 * Extract all <VariableDelete> blocks — returns list of variable keys to delete.
 * Supports JSON array format ["key1", "key2"] or comma-separated "key1, key2".
 */
export function extractVariableDeletes(text: string): string[] {
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  VARIABLE_DELETE_RE.lastIndex = 0;

  while ((match = VARIABLE_DELETE_RE.exec(text)) !== null) {
    const content = match[1].trim();
    if (!content) continue;

    // Try JSON array first
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        keys.push(...parsed.filter((k): k is string => typeof k === 'string').map(k => k.trim()).filter(Boolean));
        continue;
      }
    } catch {
      // Not JSON — try comma-separated
    }
    keys.push(...content.split(',').map(k => k.trim()).filter(Boolean));
  }
  return keys;
}
