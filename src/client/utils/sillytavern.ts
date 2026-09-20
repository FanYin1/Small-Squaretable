/**
 * Clean SillyTavern description for display
 * Strips template placeholders, XML tags, markdown formatting, etc.
 *
 * @param description - Raw SillyTavern description text
 * @param charName - Character name to substitute for {{char}}
 * @param maxLength - Maximum length of the cleaned text (default 200)
 * @returns Clean, human-readable description
 */
export function cleanDescription(description: string | undefined, charName?: string, maxLength = 200): string {
  if (!description) return '';

  let text = description;

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
export interface SillyTavernCharacter {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  spec?: string;
  spec_version?: string;
  data?: {
    avatar?: string;
    [key: string]: any;
  };
  extensions?: Record<string, any>;
  // V3 fields
  alternate_greetings?: string[];
  post_history_instructions?: string;
  creator_notes_multilingual?: Record<string, string>;
  source?: string[];
  group_only_greetings?: string[];
  creation_date?: number;
  modification_date?: number;
  assets?: Array<{ type: string; uri: string; name: string; ext: string }>;
  [key: string]: any; // Allow custom fields
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Export internal character to SillyTavern format
 *
 * @param character - Internal character object
 * @returns SillyTavern character card
 */
export function exportToSillyTavern(character: Character): SillyTavernCharacter {
  const cardData = character.cardData || {};

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
 * Import SillyTavern character to internal format
 *
 * @param stCharacter - SillyTavern character card (V1 or V2 format)
 * @returns Internal character input object
 */
export function importFromSillyTavern(stCharacter: SillyTavernCharacter | any): {
  name: string;
  description?: string;
  avatarUrl?: string;
  tags?: string[];
  cardData: Record<string, any>;
  isNsfw?: boolean;
} {
  // Normalize V2 format to flat structure
  const normalized = normalizeSillyTavernData(stCharacter);

  // Extract avatar from data field if present
  const avatarUrl = normalized.data?.avatar;

  // Build cardData with all SillyTavern fields
  const cardData: Record<string, any> = {
    name: normalized.name,
    description: normalized.description,
    personality: normalized.personality,
    scenario: normalized.scenario,
    first_mes: normalized.first_mes,
    mes_example: normalized.mes_example,
    spec: normalized.spec || stCharacter.spec || 'chara_card_v2',
    spec_version: normalized.spec_version || stCharacter.spec_version || '2.0',
  };

  // Add optional fields
  if (normalized.creator) {
    cardData.creator = normalized.creator;
  }

  if (normalized.character_version) {
    cardData.character_version = normalized.character_version;
  }

  if (normalized.extensions) {
    cardData.extensions = normalized.extensions;
  }

  // For V2/V3 format, preserve the entire data block
  if (isV2Format(stCharacter) || isV3Format(stCharacter)) {
    cardData.data = stCharacter.data;
  } else if (normalized.data) {
    cardData.data = normalized.data;
  }

  // Preserve any custom fields
  Object.keys(normalized).forEach((key) => {
    if (
      !['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'spec', 'spec_version', 'tags', 'creator', 'character_version', 'extensions', 'data'].includes(key)
    ) {
      cardData[key] = normalized[key];
    }
  });

  return {
    name: normalized.name,
    description: normalized.description,
    avatarUrl,
    tags: normalized.tags,
    cardData,
  };
}

/**
 * Check if data is V2 format (data nested in 'data' block)
 */
export function isV2Format(data: any): boolean {
  return Boolean(data.spec === 'chara_card_v2' && data.data && typeof data.data === 'object' && data.data.name);
}

/**
 * Check if data is V3 format (data nested in 'data' block, spec is chara_card_v3)
 */
export function isV3Format(data: any): boolean {
  return Boolean(data.spec === 'chara_card_v3' && data.data && typeof data.data === 'object' && data.data.name);
}

/**
 * Normalize SillyTavern character data to flat format
 * V2 format has data nested in 'data' block, V1 has it at top level
 */
export function normalizeSillyTavernData(data: any): SillyTavernCharacter {
  if (isV2Format(data) || isV3Format(data)) {
    // V2 format: extract data from nested 'data' block
    const innerData = data.data;
    return {
      name: innerData.name,
      description: innerData.description || '',
      personality: innerData.personality || '',
      scenario: innerData.scenario || '',
      first_mes: innerData.first_mes || '',
      mes_example: innerData.mes_example || '',
      tags: innerData.tags || [],
      creator: innerData.creator,
      character_version: innerData.character_version,
      spec: data.spec,
      spec_version: data.spec_version,
      extensions: innerData.extensions,
      data: innerData,
      // Preserve V2-specific fields
      ...Object.fromEntries(
        Object.entries(innerData).filter(([key]) =>
          !['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'tags', 'creator', 'character_version', 'extensions', 'avatar'].includes(key)
        )
      ),
    };
  }
  // V1 format or already flat: return as-is
  return data;
}

/**
 * Validate SillyTavern character format
 *
 * @param data - Data to validate
 * @returns Validation result
 */
export function validateSillyTavernFormat(data: any): ValidationResult {
  const errors: string[] = [];

  // Normalize V2/V3 format first
  const normalized = (isV2Format(data) || isV3Format(data)) ? data.data : data;

  // Check required fields
  if (!normalized.name) {
    errors.push('Missing required field: name');
  } else if (typeof normalized.name !== 'string') {
    errors.push('Field "name" must be a string');
  }

  // Check optional field types
  if (normalized.description !== undefined && typeof normalized.description !== 'string') {
    errors.push('Field "description" must be a string');
  }

  if (normalized.personality !== undefined && typeof normalized.personality !== 'string') {
    errors.push('Field "personality" must be a string');
  }

  if (normalized.scenario !== undefined && typeof normalized.scenario !== 'string') {
    errors.push('Field "scenario" must be a string');
  }

  if (normalized.first_mes !== undefined && typeof normalized.first_mes !== 'string') {
    errors.push('Field "first_mes" must be a string');
  }

  if (normalized.mes_example !== undefined && typeof normalized.mes_example !== 'string') {
    errors.push('Field "mes_example" must be a string');
  }

  if (normalized.tags !== undefined && !Array.isArray(normalized.tags)) {
    errors.push('Field "tags" must be an array');
  }

  if (data.spec !== undefined && typeof data.spec !== 'string') {
    errors.push('Field "spec" must be a string');
  }

  if (data.spec_version !== undefined && typeof data.spec_version !== 'string') {
    errors.push('Field "spec_version" must be a string');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
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
export async function readCharacterPng(file: File): Promise<{
  name: string;
  description?: string;
  avatarUrl?: string;
  tags?: string[];
  cardData: Record<string, any>;
  isNsfw?: boolean;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);

        // PNG signature check
        const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) {
          if (uint8Array[i] !== pngSignature[i]) {
            reject(new Error('Invalid PNG file'));
            return;
          }
        }

        // Parse PNG chunks to find tEXt chunk with "chara" keyword
        let offset = 8;
        let characterData: string | null = null;

        while (offset < uint8Array.length) {
          // Read chunk length (4 bytes, big-endian)
          const length = (uint8Array[offset] << 24) |
                        (uint8Array[offset + 1] << 16) |
                        (uint8Array[offset + 2] << 8) |
                        uint8Array[offset + 3];

          // Read chunk type (4 bytes)
          const type = String.fromCharCode(
            uint8Array[offset + 4],
            uint8Array[offset + 5],
            uint8Array[offset + 6],
            uint8Array[offset + 7]
          );

          if (type === 'tEXt' || type === 'iTXt') {
            // Read chunk data
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;
            const chunkData = uint8Array.slice(dataStart, dataEnd);

            // Find null separator between keyword and text
            let nullIndex = 0;
            for (let i = 0; i < chunkData.length; i++) {
              if (chunkData[i] === 0) {
                nullIndex = i;
                break;
              }
            }

            const keyword = new TextDecoder().decode(chunkData.slice(0, nullIndex));

            if (keyword === 'chara') {
              // For iTXt, skip compression flag, compression method, language tag, and translated keyword
              let textStart = nullIndex + 1;
              if (type === 'iTXt') {
                // Skip compression flag (1 byte) and compression method (1 byte)
                textStart += 2;
                // Skip language tag (null-terminated)
                while (textStart < chunkData.length && chunkData[textStart] !== 0) {
                  textStart++;
                }
                textStart++; // Skip null
                // Skip translated keyword (null-terminated)
                while (textStart < chunkData.length && chunkData[textStart] !== 0) {
                  textStart++;
                }
                textStart++; // Skip null
              }

              const base64Data = new TextDecoder().decode(chunkData.slice(textStart));
              // Decode base64 to bytes, then bytes to UTF-8
              // atob() only produces Latin-1, which corrupts multi-byte UTF-8 (e.g. Chinese)
              const binaryStr = atob(base64Data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              characterData = new TextDecoder('utf-8').decode(bytes);
              break;
            }
          }

          if (type === 'IEND') {
            break;
          }

          // Move to next chunk (length + type + data + CRC)
          offset += 4 + 4 + length + 4;
        }

        if (!characterData) {
          reject(new Error('No character data found in PNG file'));
          return;
        }

        // Parse character JSON
        const stCharacter = JSON.parse(characterData);

        // Validate format
        const validation = validateSillyTavernFormat(stCharacter);
        if (!validation.valid) {
          reject(new Error(`Invalid character format: ${validation.errors.join(', ')}`));
          return;
        }

        // Convert to internal format
        const character = importFromSillyTavern(stCharacter);

        // Use the PNG file itself as avatar
        const avatarUrl = URL.createObjectURL(file);
        character.avatarUrl = avatarUrl;

        resolve(character);
      } catch (error) {
        reject(new Error(`Failed to parse PNG character: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read character from uploaded file (JSON or PNG)
 *
 * @param file - File to read
 * @returns Promise resolving to character data
 */
export async function readCharacterFile(file: File): Promise<{
  name: string;
  description?: string;
  avatarUrl?: string;
  tags?: string[];
  cardData: Record<string, any>;
  isNsfw?: boolean;
}> {
  const extension = file.name.toLowerCase().split('.').pop();

  // Detect actual format by reading magic bytes (handles mismatched extensions)
  const actualFormat = await detectFileFormat(file);

  if (extension === 'json' || actualFormat === 'json') {
    return readCharacterJson(file);
  }

  if (actualFormat === 'png') {
    // Try PNG character card extraction; fall back to image-only if no data found
    try {
      return await readCharacterPng(file);
    } catch {
      // PNG without embedded character data — treat as plain image
      return readCharacterImage(file);
    }
  }

  if (actualFormat === 'image' || extension === 'jpg' || extension === 'jpeg' || extension === 'webp' || extension === 'png') {
    return readCharacterImage(file);
  }

  throw new Error('Unsupported file format. Please use .json, .png, .jpg or .webp files.');
}

/**
 * Detect actual file format by reading magic bytes.
 * Returns 'png', 'json', or 'image' (for JPEG/WEBP/other images).
 */
async function detectFileFormat(file: File): Promise<'png' | 'json' | 'image'> {
  const header = await readFileHeader(file, 8);

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    return 'image';
  }

  // WEBP: RIFF....WEBP
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
    return 'image';
  }

  // JSON: starts with { or [
  const firstByte = header[0];
  if (firstByte === 0x7B || firstByte === 0x5B) {
    return 'json';
  }

  // UTF-8 BOM + JSON
  if (header[0] === 0xEF && header[1] === 0xBB && header[2] === 0xBF && (header[3] === 0x7B || header[3] === 0x5B)) {
    return 'json';
  }

  return 'image';
}

/**
 * Read the first N bytes of a file using FileReader (works in all environments including jsdom).
 */
function readFileHeader(file: File, bytes: number): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      resolve(new Uint8Array(0));
    };
    reader.readAsArrayBuffer(file.slice(0, bytes));
  });
}

/**
 * Read character from uploaded JSON file
 *
 * @param file - File to read
 * @returns Promise resolving to character data
 */
export async function readCharacterJson(file: File): Promise<{
  name: string;
  description?: string;
  avatarUrl?: string;
  tags?: string[];
  cardData: Record<string, any>;
  isNsfw?: boolean;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const stCharacter = JSON.parse(json);

        // Validate format
        const validation = validateSillyTavernFormat(stCharacter);
        if (!validation.valid) {
          reject(new Error(`Invalid character format: ${validation.errors.join(', ')}`));
          return;
        }

        // Convert to internal format
        const character = importFromSillyTavern(stCharacter);
        resolve(character);
      } catch (error) {
        reject(new Error(`Failed to parse character file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
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
