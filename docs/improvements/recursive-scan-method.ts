/**
 * Perform recursive scanning on entries
 * When an entry is triggered, its content is also scanned for keywords
 *
 * @param initialScanText - Initial text to scan (chat messages)
 * @param allEntries - All available entries
 * @param characterId - Current character ID for filtering
 * @param recentMessages - Recent messages for scan depth limiting
 * @param maxDepth - Maximum recursion depth (default: 3)
 * @returns Array of activated entries with matched keywords
 */
private scanRecursive(
  initialScanText: string,
  allEntries: any[],
  characterId: string,
  recentMessages: any[],
  maxDepth: number = 3
): Array<{ entry: any; matchedKeyword: string; depth: number }> {
  const activated = new Map<string, { entry: any; matchedKeyword: string; depth: number }>();
  let currentScanText = initialScanText;
  let recursionDepth = 0;

  while (recursionDepth < maxDepth) {
    const newlyActivated: Array<{ entry: any; matchedKeyword: string }> = [];

    for (const entry of allEntries) {
      // Skip if already activated
      if (activated.has(entry.id)) continue;

      // Skip if preventRecursion is true and we're in recursive scan
      const preventRecursion = (entry as any).preventRecursion ?? false;
      if (preventRecursion && recursionDepth > 0) continue;

      const settings = (entry.settings ?? {}) as any;
      const caseSensitive = settings.caseSensitive ?? false;
      const wholeWords = settings.matchWholeWords ?? false;
      const isConstant = settings.constant ?? false;

      // Check character filter
      const characterFilter = (entry as any).characterFilter as string[] | undefined;
      if (characterFilter && characterFilter.length > 0) {
        if (!characterFilter.includes(characterId)) {
          continue;
        }
      }

      // Check scan depth limit
      const scanDepth = (entry as any).scanDepth as number | undefined;
      let scanTextForEntry = currentScanText;
      if (scanDepth && scanDepth > 0 && recursionDepth === 0) {
        // Only apply scan depth limit on first iteration
        const limitedMessages = recentMessages.slice(-scanDepth);
        scanTextForEntry = limitedMessages.map((m: any) => m.content).join('\n');
      }

      // Determine primary keys
      const primaryKeys: string[] = settings.keys && settings.keys.length > 0
        ? settings.keys
        : entry.keyword.split(',').map((k: string) => k.trim()).filter(Boolean);

      let matched = false;
      let matchedKeyword = '';

      if (isConstant && recursionDepth === 0) {
        // Constants only match on first iteration
        matched = true;
        matchedKeyword = '(constant)';
      } else {
        const hasSecondaryKeys = settings.keysSecondary && settings.keysSecondary.length > 0;
        const logic = normalizeSelectiveLogic(settings.selectiveLogic);

        if (primaryKeys.length === 0 && hasSecondaryKeys) {
          matched = checkSecondaryKeys(scanTextForEntry, settings.keysSecondary!, logic, caseSensitive, wholeWords);
          if (matched) matchedKeyword = '(secondary)';
        } else {
          // Check primary keys
          for (const key of primaryKeys) {
            if (keywordMatches(scanTextForEntry, key, caseSensitive, wholeWords)) {
              matchedKeyword = key;
              matched = true;
              break;
            }
          }
          // Check secondary keys if primary matched
          if (matched && hasSecondaryKeys) {
            const secondaryMatched = checkSecondaryKeys(scanTextForEntry, settings.keysSecondary!, logic, caseSensitive, wholeWords);
            if (!secondaryMatched) {
              matched = false;
              matchedKeyword = '';
            }
          }
        }
      }

      if (matched) {
        newlyActivated.push({ entry, matchedKeyword });
        activated.set(entry.id, { entry, matchedKeyword, depth: recursionDepth });
      }
    }

    // If no new entries activated, stop recursion
    if (newlyActivated.length === 0) break;

    // Add content of recursive entries to scan text for next iteration
    const recursiveEntries = newlyActivated.filter(({ entry }) => {
      const recursive = (entry as any).recursive ?? true;
      return recursive;
    });

    if (recursiveEntries.length > 0) {
      const additionalText = recursiveEntries.map(({ entry }) => entry.content).join('\n');
      currentScanText += '\n' + additionalText;
    } else {
      // No recursive entries, stop
      break;
    }

    recursionDepth++;
  }

  return Array.from(activated.values());
}
