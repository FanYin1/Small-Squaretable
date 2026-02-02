/**
 * SillyTavern Import/Export Utilities Tests
 *
 * Tests for converting between internal character format and SillyTavern JSON format
 */

import { describe, it, expect } from 'vitest';
import {
  exportToSillyTavern,
  importFromSillyTavern,
  validateSillyTavernFormat,
  type SillyTavernCharacter,
} from './sillytavern';
import type { Character } from '@client/types';

describe('SillyTavern Import/Export', () => {
  describe('exportToSillyTavern', () => {
    it('should convert internal character to SillyTavern format', () => {
      const character: Character = {
        id: '123',
        name: 'Test Character',
        description: 'A test character',
        avatar: 'https://example.com/avatar.png',
        tags: ['fantasy', 'adventure'],
        category: 'Fantasy',
        isPublic: true,
        isNsfw: false,
        rating: 4.5,
        ratingCount: 10,
        downloadCount: 100,
        viewCount: 500,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        cardData: {
          name: 'Test Character',
          description: 'A test character',
          personality: 'Friendly and helpful',
          scenario: 'In a fantasy world',
          first_mes: 'Hello! How can I help you?',
          mes_example: '<START>\n{{user}}: Hi\n{{char}}: Hello!',
        },
      };

      const result = exportToSillyTavern(character);

      expect(result.name).toBe('Test Character');
      expect(result.description).toBe('A test character');
      expect(result.personality).toBe('Friendly and helpful');
      expect(result.scenario).toBe('In a fantasy world');
      expect(result.first_mes).toBe('Hello! How can I help you?');
      expect(result.mes_example).toBe('<START>\n{{user}}: Hi\n{{char}}: Hello!');
      expect(result.tags).toEqual(['fantasy', 'adventure']);
      expect(result.spec).toBe('chara_card_v2');
      expect(result.spec_version).toBe('2.0');
    });

    it('should handle missing optional fields', () => {
      const character: Character = {
        id: '123',
        name: 'Minimal Character',
        description: '',
        avatar: undefined,
        tags: [],
        category: undefined,
        isPublic: false,
        isNsfw: false,
        rating: 0,
        ratingCount: 0,
        downloadCount: 0,
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        cardData: {
          name: 'Minimal Character',
        },
      };

      const result = exportToSillyTavern(character);

      expect(result.name).toBe('Minimal Character');
      expect(result.description).toBe('');
      expect(result.personality).toBe('');
      expect(result.scenario).toBe('');
      expect(result.first_mes).toBe('');
      expect(result.mes_example).toBe('');
      expect(result.tags).toEqual([]);
    });

    it('should preserve custom cardData fields', () => {
      const character: Character = {
        id: '123',
        name: 'Custom Character',
        description: 'Custom',
        avatar: undefined,
        tags: [],
        category: undefined,
        isPublic: false,
        isNsfw: false,
        rating: 0,
        ratingCount: 0,
        downloadCount: 0,
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        cardData: {
          name: 'Custom Character',
          custom_field: 'custom_value',
          extensions: {
            depth_prompt: 'Custom depth prompt',
          },
        },
      };

      const result = exportToSillyTavern(character);

      expect(result.custom_field).toBe('custom_value');
      expect(result.extensions).toEqual({
        depth_prompt: 'Custom depth prompt',
      });
    });
  });

  describe('importFromSillyTavern', () => {
    it('should convert SillyTavern format to internal character', () => {
      const stCharacter: SillyTavernCharacter = {
        name: 'Imported Character',
        description: 'An imported character',
        personality: 'Brave and curious',
        scenario: 'Exploring ancient ruins',
        first_mes: 'Greetings, adventurer!',
        mes_example: '<START>\n{{user}}: Hello\n{{char}}: Greetings!',
        tags: ['adventure', 'exploration'],
        spec: 'chara_card_v2',
        spec_version: '2.0',
      };

      const result = importFromSillyTavern(stCharacter);

      expect(result.name).toBe('Imported Character');
      expect(result.description).toBe('An imported character');
      expect(result.tags).toEqual(['adventure', 'exploration']);
      expect(result.cardData.name).toBe('Imported Character');
      expect(result.cardData.description).toBe('An imported character');
      expect(result.cardData.personality).toBe('Brave and curious');
      expect(result.cardData.scenario).toBe('Exploring ancient ruins');
      expect(result.cardData.first_mes).toBe('Greetings, adventurer!');
      expect(result.cardData.mes_example).toBe('<START>\n{{user}}: Hello\n{{char}}: Greetings!');
    });

    it('should handle v1 format', () => {
      const stCharacter: SillyTavernCharacter = {
        name: 'V1 Character',
        description: 'A v1 character',
        personality: 'Friendly',
        scenario: 'In a tavern',
        first_mes: 'Hello!',
        mes_example: 'Example',
        spec: 'chara_card_v1',
        spec_version: '1.0',
      };

      const result = importFromSillyTavern(stCharacter);

      expect(result.name).toBe('V1 Character');
      expect(result.cardData.spec).toBe('chara_card_v1');
    });

    it('should preserve custom fields', () => {
      const stCharacter: SillyTavernCharacter = {
        name: 'Custom Character',
        description: 'Custom',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        custom_field: 'custom_value',
        extensions: {
          depth_prompt: 'Custom depth',
        },
        spec: 'chara_card_v2',
        spec_version: '2.0',
      };

      const result = importFromSillyTavern(stCharacter);

      expect(result.cardData.custom_field).toBe('custom_value');
      expect(result.cardData.extensions).toEqual({
        depth_prompt: 'Custom depth',
      });
    });

    it('should extract avatar from data field', () => {
      const stCharacter: SillyTavernCharacter = {
        name: 'Avatar Character',
        description: 'Has avatar',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        data: {
          avatar: 'https://example.com/avatar.png',
        },
        spec: 'chara_card_v2',
        spec_version: '2.0',
      };

      const result = importFromSillyTavern(stCharacter);

      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    });
  });

  describe('validateSillyTavernFormat', () => {
    it('should validate correct SillyTavern format', () => {
      const stCharacter: SillyTavernCharacter = {
        name: 'Valid Character',
        description: 'Valid',
        personality: 'Friendly',
        scenario: 'Test',
        first_mes: 'Hello',
        mes_example: 'Example',
        spec: 'chara_card_v2',
        spec_version: '2.0',
      };

      const result = validateSillyTavernFormat(stCharacter);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject missing required fields', () => {
      const stCharacter = {
        description: 'Missing name',
        personality: 'Friendly',
      } as any;

      const result = validateSillyTavernFormat(stCharacter);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should reject invalid name type', () => {
      const stCharacter = {
        name: 123,
        description: 'Invalid name type',
      } as any;

      const result = validateSillyTavernFormat(stCharacter);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should accept missing optional fields', () => {
      const stCharacter: SillyTavernCharacter = {
        name: 'Minimal Character',
        description: '',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        spec: 'chara_card_v2',
        spec_version: '2.0',
      };

      const result = validateSillyTavernFormat(stCharacter);

      expect(result.valid).toBe(true);
    });

    it('should validate tags array', () => {
      const stCharacter = {
        name: 'Tagged Character',
        description: 'Has tags',
        tags: 'not-an-array',
      } as any;

      const result = validateSillyTavernFormat(stCharacter);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tags'))).toBe(true);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve data through export and import', () => {
      const original: Character = {
        id: '123',
        name: 'Round Trip Character',
        description: 'Testing round trip',
        avatar: 'https://example.com/avatar.png',
        tags: ['test', 'round-trip'],
        category: 'Test',
        isPublic: true,
        isNsfw: false,
        rating: 4.0,
        ratingCount: 5,
        downloadCount: 50,
        viewCount: 200,
        createdAt: new Date(),
        updatedAt: new Date(),
        cardData: {
          name: 'Round Trip Character',
          description: 'Testing round trip',
          personality: 'Consistent',
          scenario: 'Test scenario',
          first_mes: 'Hello!',
          mes_example: 'Example',
          custom_field: 'preserved',
        },
      };

      const exported = exportToSillyTavern(original);
      const imported = importFromSillyTavern(exported);

      expect(imported.name).toBe(original.name);
      expect(imported.description).toBe(original.description);
      expect(imported.tags).toEqual(original.tags);
      expect(imported.cardData.personality).toBe(original.cardData.personality);
      expect(imported.cardData.scenario).toBe(original.cardData.scenario);
      expect(imported.cardData.first_mes).toBe(original.cardData.first_mes);
      expect(imported.cardData.mes_example).toBe(original.cardData.mes_example);
      expect(imported.cardData.custom_field).toBe(original.cardData.custom_field);
    });
  });
});
