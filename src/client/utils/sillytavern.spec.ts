import { describe, it, expect } from 'vitest';
import {
  isV2Format,
  isV3Format,
  normalizeSillyTavernData,
  importFromSillyTavern,
  exportToSillyTavern,
  readCharacterImage,
  readCharacterFile,
} from './sillytavern';
import type { Character } from '@client/types';

describe('sillytavern V3 card spec', () => {
  describe('isV3Format', () => {
    it('returns true for a valid V3 card', () => {
      const card = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: { name: 'Alice', description: 'A character' },
      };
      expect(isV3Format(card)).toBe(true);
    });

    it('returns false for a V2 card', () => {
      const card = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: { name: 'Bob' },
      };
      expect(isV3Format(card)).toBe(false);
    });

    it('returns false when data block is missing', () => {
      const card = { spec: 'chara_card_v3', spec_version: '3.0' };
      expect(isV3Format(card)).toBe(false);
    });

    it('returns false when data.name is missing', () => {
      const card = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: { description: 'no name' },
      };
      expect(isV3Format(card)).toBe(false);
    });
  });

  describe('importFromSillyTavern (V3)', () => {
    it('normalizes a V3 card and preserves V3 fields', () => {
      const v3Card = {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
          name: 'Luna',
          description: 'A moon spirit',
          personality: 'calm',
          scenario: 'night sky',
          first_mes: 'Hello traveler',
          mes_example: '<START>',
          alternate_greetings: ['Hi there', 'Greetings'],
          assets: [{ type: 'icon', uri: 'https://example.com/icon.png', name: 'icon', ext: 'png' }],
          creator_notes_multilingual: { en: 'English notes', ja: 'Japanese notes' },
          source: ['https://example.com'],
          group_only_greetings: ['Group hello'],
          creation_date: 1700000000,
          modification_date: 1700100000,
        },
      };

      const result = importFromSillyTavern(v3Card);

      expect(result.name).toBe('Luna');
      expect(result.cardData.spec).toBe('chara_card_v3');
      expect(result.cardData.spec_version).toBe('3.0');
      expect(result.cardData.alternate_greetings).toEqual(['Hi there', 'Greetings']);
      expect(result.cardData.assets).toHaveLength(1);
      expect(result.cardData.creator_notes_multilingual).toEqual({ en: 'English notes', ja: 'Japanese notes' });
      expect(result.cardData.source).toEqual(['https://example.com']);
      expect(result.cardData.group_only_greetings).toEqual(['Group hello']);
      expect(result.cardData.creation_date).toBe(1700000000);
      expect(result.cardData.modification_date).toBe(1700100000);
      // The full data block should be preserved
      expect(result.cardData.data).toBeDefined();
    });
  });

  describe('exportToSillyTavern (V3 auto-detect)', () => {
    const baseCharacter: Character = {
      id: '1',
      name: 'TestChar',
      description: 'A test character',
      isPublic: false,
      createdAt: '2024-01-01T00:00:00Z',
    };

    it('sets chara_card_v3 when V3 fields are present in cardData', () => {
      const character: Character = {
        ...baseCharacter,
        cardData: {
          personality: 'brave',
          scenario: 'adventure',
          first_mes: 'Hello!',
          mes_example: '',
          alternate_greetings: ['Hey', 'Yo'],
          assets: [{ type: 'icon', uri: 'https://x.com/i.png', name: 'i', ext: 'png' }],
        },
      };

      const result = exportToSillyTavern(character);

      expect(result.spec).toBe('chara_card_v3');
      expect(result.spec_version).toBe('3.0');
      expect(result.alternate_greetings).toEqual(['Hey', 'Yo']);
      expect(result.assets).toHaveLength(1);
    });

    it('keeps chara_card_v2 when no V3 fields are present', () => {
      const character: Character = {
        ...baseCharacter,
        cardData: {
          personality: 'shy',
          scenario: 'school',
          first_mes: 'Hi...',
          mes_example: '',
        },
      };

      const result = exportToSillyTavern(character);

      expect(result.spec).toBe('chara_card_v2');
      expect(result.spec_version).toBe('2.0');
    });

    it('detects V3 from creator_notes_multilingual alone', () => {
      const character: Character = {
        ...baseCharacter,
        cardData: {
          personality: '',
          scenario: '',
          first_mes: '',
          mes_example: '',
          creator_notes_multilingual: { en: 'notes' },
        },
      };

      const result = exportToSillyTavern(character);
      expect(result.spec).toBe('chara_card_v3');
      expect(result.spec_version).toBe('3.0');
    });
  });
});

describe('readCharacterImage', () => {
  it('creates character from JPG file with name derived from filename', async () => {
    const file = new File([new Uint8Array(10)], 'IMG_0221.jpg', { type: 'image/jpeg' });
    const result = await readCharacterImage(file);

    expect(result.name).toBe('IMG 0221');
    expect(result.avatarUrl).toMatch(/^data:/);
    expect(result.cardData.name).toBe('IMG 0221');
    expect(result.cardData.description).toBe('');
  });

  it('handles underscored filenames', async () => {
    const file = new File([new Uint8Array(10)], 'my_cool_character.webp', { type: 'image/webp' });
    const result = await readCharacterImage(file);

    expect(result.name).toBe('my cool character');
  });

  it('falls back to default name for empty filename', async () => {
    const file = new File([new Uint8Array(10)], '.jpeg', { type: 'image/jpeg' });
    const result = await readCharacterImage(file);

    expect(result.name).toBe('Imported Character');
  });
});

describe('readCharacterFile — magic byte detection', () => {
  it('detects PNG with .jpg extension as PNG and falls back to image import', async () => {
    // PNG signature + minimal IHDR + IEND (no tEXt chunk)
    const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    // IHDR chunk (13 bytes data)
    const ihdr = new Uint8Array([
      0, 0, 0, 13, // length
      73, 72, 68, 82, // "IHDR"
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, // 1x1 RGB
      0x90, 0x77, 0x53, 0xDE, // CRC
    ]);
    // IEND chunk
    const iend = new Uint8Array([
      0, 0, 0, 0, // length
      73, 69, 78, 68, // "IEND"
      0xAE, 0x42, 0x60, 0x82, // CRC
    ]);
    const pngData = new Uint8Array([...pngSignature, ...ihdr, ...iend]);
    const file = new File([pngData], 'avatar.jpg', { type: 'image/jpeg' });

    const result = await readCharacterFile(file);

    // Should detect as PNG, find no character data, fall back to image import
    expect(result.name).toBe('avatar');
    expect(result.avatarUrl).toMatch(/^data:/);
    expect(result.cardData.name).toBe('avatar');
  });

  it('detects JPEG by magic bytes', async () => {
    const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
    const file = new File([jpegHeader], 'photo.jpg', { type: 'image/jpeg' });

    const result = await readCharacterFile(file);

    expect(result.name).toBe('photo');
    expect(result.avatarUrl).toMatch(/^data:/);
  });

  it('detects JSON content regardless of extension', async () => {
    const json = JSON.stringify({ name: 'TestChar', description: 'A test' });
    const file = new File([json], 'character.txt', { type: 'text/plain' });

    const result = await readCharacterFile(file);

    expect(result.name).toBe('TestChar');
  });
});
