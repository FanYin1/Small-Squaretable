/**
 * SillyTavern Import/Export Utilities
 *
 * Converts between internal character format and SillyTavern JSON format
 * Supports both v1 and v2 character card specifications
 */

import type { Character } from '@client/types';

/**
 * SillyTavern Character Card Format (v2)
 * Based on: https://github.com/malfoyslastname/character-card-spec-v2
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

  return stCharacter;
}

/**
 * Import SillyTavern character to internal format
 *
 * @param stCharacter - SillyTavern character card
 * @returns Internal character input object
 */
export function importFromSillyTavern(stCharacter: SillyTavernCharacter): {
  name: string;
  description?: string;
  avatarUrl?: string;
  tags?: string[];
  cardData: Record<string, any>;
  isNsfw?: boolean;
} {
  // Extract avatar from data field if present
  const avatarUrl = stCharacter.data?.avatar;

  // Build cardData with all SillyTavern fields
  const cardData: Record<string, any> = {
    name: stCharacter.name,
    description: stCharacter.description,
    personality: stCharacter.personality,
    scenario: stCharacter.scenario,
    first_mes: stCharacter.first_mes,
    mes_example: stCharacter.mes_example,
    spec: stCharacter.spec || 'chara_card_v2',
    spec_version: stCharacter.spec_version || '2.0',
  };

  // Add optional fields
  if (stCharacter.creator) {
    cardData.creator = stCharacter.creator;
  }

  if (stCharacter.character_version) {
    cardData.character_version = stCharacter.character_version;
  }

  if (stCharacter.extensions) {
    cardData.extensions = stCharacter.extensions;
  }

  if (stCharacter.data) {
    cardData.data = stCharacter.data;
  }

  // Preserve any custom fields
  Object.keys(stCharacter).forEach((key) => {
    if (
      !['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'spec', 'spec_version', 'tags', 'creator', 'character_version', 'extensions', 'data'].includes(key)
    ) {
      cardData[key] = stCharacter[key];
    }
  });

  return {
    name: stCharacter.name,
    description: stCharacter.description,
    avatarUrl,
    tags: stCharacter.tags,
    cardData,
  };
}

/**
 * Validate SillyTavern character format
 *
 * @param data - Data to validate
 * @returns Validation result
 */
export function validateSillyTavernFormat(data: any): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (!data.name) {
    errors.push('Missing required field: name');
  } else if (typeof data.name !== 'string') {
    errors.push('Field "name" must be a string');
  }

  // Check optional field types
  if (data.description !== undefined && typeof data.description !== 'string') {
    errors.push('Field "description" must be a string');
  }

  if (data.personality !== undefined && typeof data.personality !== 'string') {
    errors.push('Field "personality" must be a string');
  }

  if (data.scenario !== undefined && typeof data.scenario !== 'string') {
    errors.push('Field "scenario" must be a string');
  }

  if (data.first_mes !== undefined && typeof data.first_mes !== 'string') {
    errors.push('Field "first_mes" must be a string');
  }

  if (data.mes_example !== undefined && typeof data.mes_example !== 'string') {
    errors.push('Field "mes_example" must be a string');
  }

  if (data.tags !== undefined && !Array.isArray(data.tags)) {
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
