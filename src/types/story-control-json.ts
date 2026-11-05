/** Presentation-only normalization. Never add a value, quote, key or delimiter. */
export function withoutTrailingCommas(encoded: string): string | null {
  let quoted = false, escaped = false, changed = false;
  let result = '';
  for (let index = 0; index < encoded.length; index++) {
    const char = encoded[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      let next = index + 1;
      while (/[\x20\t\r\n]/.test(encoded[next] ?? '') && next < encoded.length) next++;
      // Empty containers or repeated commas are not trailing-separator mistakes.
      const previous = result.trimEnd().at(-1);
      if ((encoded[next] === '}' || encoded[next] === ']') && previous && !'{[,:'.includes(previous)) {
        changed = true; continue;
      }
    }
    result += char;
  }
  return changed ? result : null;
}

/** Run only after JSON.parse succeeds. Detect duplicate decoded keys at ANY nesting level.
 * JSON.parse silently keeps the last value; story authority must never depend on that.
 */
export function duplicateJsonKeyOffset(encoded: string): number | null {
  const objects: Array<Set<string> | null> = [];
  for (let index = 0; index < encoded.length; index++) {
    const char = encoded[index];
    if (char === '{') objects.push(new Set());
    else if (char === '[') objects.push(null);
    else if (char === '}' || char === ']') objects.pop();
    else if (char === '"') {
      const start = index++;
      for (; index < encoded.length; index++) {
        if (encoded[index] === '\\') index++;
        else if (encoded[index] === '"') break;
      }
      let next = index + 1;
      while (next < encoded.length && /[\x20\t\r\n]/.test(encoded[next])) next++;
      if (encoded[next] !== ':') continue;
      const keys = objects.at(-1);
      if (!keys) continue;
      const key: string = JSON.parse(encoded.slice(start, index + 1));
      if (keys.has(key)) return start;
      keys.add(key);
    }
  }
  return null;
}
