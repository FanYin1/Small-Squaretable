/**
 * Clean SillyTavern description for display
 * Strips template placeholders, XML tags, markdown formatting, etc.
 *
 * @param description - Raw SillyTavern description text
 * @param charName - Character name to substitute for {{char}}
 * @param maxLength - Maximum length of the cleaned text (default 200)
 * @returns Clean, human-readable description
 */
import { storyDisplayText } from './story-display';

export function cleanDescription(description: string | undefined, charName?: string, maxLength = 200): string {
  if (!description) return '';

  let text = storyDisplayText(description, { characterName: charName, limit: Number.MAX_SAFE_INTEGER, multiline: true });

  // Replace {{char}} with character name or remove
  text = text.replace(/\{\{char\}\}/gi, charName || '');
  // Replace {{user}} with "you"
  text = text.replace(/\{\{user\}\}/gi, 'you');

  // Strip XML-like tags: <Setting>, </Setting>, <Overview>, etc.
  text = text.replace(/<\/?[A-Za-z][A-Za-z0-9_]*>/g, '');

  // Strip markdown headers: # Title, ## Subtitle
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Strip markdown bold/italic: **text**, *text*, __text__, _text_
  text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  text = text.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');

  // Strip markdown code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`([^`]+)`/g, '$1');

  // Strip key=value lines like RATING = NC-21; SETTING = Medieval;
  text = text.replace(/^[A-Z_]+\s*=\s*[^;\n]+;?\s*$/gm, '');

  // Strip lines that are just labels like "Main Characters:", "GENRES ="
  text = text.replace(/^(Main Characters|GENRES|RATING|SETTING)\s*[:=].*$/gim, '');

  // Collapse \r\n and multiple newlines into single space
  text = text.replace(/\\r\\n|\\r|\\n/g, ' ');
  text = text.replace(/\r\n|\r|\n/g, ' ');

  // Collapse multiple spaces
  text = text.replace(/\s{2,}/g, ' ');

  // Trim
  text = text.trim();

  // Truncate
  if (text.length > maxLength) {
    text = text.substring(0, maxLength).replace(/\s+\S*$/, '') + '…';
  }

  return text;
}

/**
 * SillyTavern Import/Export Utilities
 *
 * Converts between internal character format and SillyTavern JSON format
 * Supports both v1 and v2 character card specifications
 */

import type { Character } from '@client/types';

/**
 * SillyTavern Character Card Format (v2/v3)
 * Based on: https://github.com/malfoyslastname/character-card-spec-v2
 * V3 adds: alternate_greetings, creator_notes_multilingual, source,
 *          group_only_greetings, creation_date, modification_date, assets
 */
export type { SillyTavernCharacter, ValidationResult } from '../../types/character-card-import';
import type { SillyTavernCharacter } from '../../types/character-card-import';
import { CharacterCardImportError, MAX_CHARACTER_FILE_BYTES, characterCardExportData, parseCharacterFile, parseCharacterJson, parseCharacterPng } from '../../types/character-card-import';
export { importFromSillyTavern, isV2Format, isV3Format, normalizeSillyTavernData, validateSillyTavernFormat } from '../../types/character-card-import';

/**
 * Export internal character to SillyTavern format
 *
 * @param character - Internal character object
 * @returns SillyTavern character card
 */
export function exportToSillyTavern(character: Character): SillyTavernCharacter {
  const cardData = characterCardExportData(character.cardData || {});

  // Build base SillyTavern character
  const stCharacter: SillyTavernCharacter = {
    name: character.name,
    description: character.description || '',
    personality: cardData.personality || '',
    scenario: cardData.scenario || '',
    first_mes: cardData.first_mes || '',
    mes_example: cardData.mes_example || '',
    spec: cardData.spec || 'chara_card_v2',
    spec_version: cardData.spec_version || '2.0',
  };

  // Add optional fields
  if (character.tags && character.tags.length > 0) {
    stCharacter.tags = character.tags;
  } else if (character.tags && character.tags.length === 0) {
    stCharacter.tags = [];
  }

  if (cardData.creator) {
    stCharacter.creator = cardData.creator;
  }

  if (cardData.character_version) {
    stCharacter.character_version = cardData.character_version;
  }

  if (cardData.extensions) {
    stCharacter.extensions = cardData.extensions;
  }

  // Add avatar to data field if present
  if (character.avatar) {
    stCharacter.data = {
      avatar: character.avatar,
      ...(cardData.data || {}),
    };
  } else if (cardData.data) {
    stCharacter.data = cardData.data;
  }

  // Preserve any custom fields from cardData
  Object.keys(cardData).forEach((key) => {
    if (
      !['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'spec', 'spec_version', 'tags', 'creator', 'character_version', 'extensions', 'data'].includes(key)
    ) {
      stCharacter[key] = cardData[key];
    }
  });

  // Auto-detect V3 fields and upgrade spec accordingly
  const hasV3Fields = cardData.alternate_greetings
    || cardData.creator_notes_multilingual
    || cardData.assets
    || cardData.source
    || cardData.group_only_greetings;

  if (hasV3Fields) {
    stCharacter.spec = 'chara_card_v3';
    stCharacter.spec_version = '3.0';
  }

  return stCharacter;
}

/**
 * Download character as JSON file
 *
 * @param character - Character to export
 * @param filename - Optional filename (defaults to character name)
 */
export function downloadCharacterJson(character: Character, filename?: string): void {
  const stCharacter = exportToSillyTavern(character);
  const json = JSON.stringify(stCharacter, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `${character.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Extract character data from PNG file
 * PNG character cards store data in tEXt chunks with keyword "chara"
 *
 * @param file - PNG file to read
 * @returns Promise resolving to character data and avatar
 */
export async function readCharacterPng(file: File) {
  const character = await parseCharacterPng(await readFileBytes(file));
  return { ...character, avatarUrl: URL.createObjectURL(file) };
}

export async function readCharacterFile(file: File) {
  const result = await parseCharacterFile(await readFileBytes(file));
  return result.format === 'png'
    ? { ...result.character, avatarUrl: URL.createObjectURL(file) }
    : result.character;
}

function readFileBytes(file: File): Promise<Uint8Array> {
  if (file.size > MAX_CHARACTER_FILE_BYTES) return Promise.reject(new CharacterCardImportError('FILE_TOO_LARGE'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onabort = () => reject(new Error('File reading cancelled'));
    reader.readAsArrayBuffer(file);
  });
}

export async function readCharacterJson(file: File) {
  return parseCharacterJson(await readFileBytes(file));
}

/**
 * Read character from an image file (JPG/JPEG/WEBP/PNG without card data)
 * Uses the image as avatar and derives the name from the filename.
 * Returns a base64 data URL for the avatar (no blob URL).
 *
 * @param file - Image file to read
 * @returns Promise resolving to character data with avatar
 */
export async function readCharacterImage(file: File): Promise<{
  name: string;
  description?: string;
  avatarUrl?: string;
  tags?: string[];
  cardData: Record<string, any>;
  isNsfw?: boolean;
}> {
  // Convert file to base64 data URL directly (avoids blob URL issues)
  const avatarUrl = await fileToDataUrl(file);
  // Derive a character name from the filename (strip extension)
  const rawName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim();
  const name = rawName || 'Imported Character';

  return {
    name,
    avatarUrl,
    cardData: {
      name,
      description: '',
      personality: '',
      scenario: '',
      first_mes: '',
      mes_example: '',
    },
  };
}

/**
 * Convert a File to a base64 data URL using FileReader.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}
