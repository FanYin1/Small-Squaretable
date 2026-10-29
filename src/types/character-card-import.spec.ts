import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { characterCardExportData, MAX_CHARACTER_FILE_BYTES, MAX_CHARACTER_METADATA_BYTES, parseCharacterFile, validateSillyTavernFormat } from './character-card-import';
import { cardV3, formatCases, pngWithMetadata, textMetadata } from '../../scripts/fixtures/character-card-formats.mjs';
import { embedJsonInPng } from '../server/utils/png-embed';
import { createCharacterSchema } from './character';

describe('Shared character file import', () => {
  for (const fixture of formatCases()) {
    it(fixture.name, async () => {
      if (fixture.code) {
        await expect(parseCharacterFile(fixture.bytes)).rejects.toMatchObject({ code: fixture.code });
      } else {
        const result = (await parseCharacterFile(fixture.bytes)).character;
        expect(result.name).toBe((fixture.original.data ?? fixture.original).name);
        expect(result.cardData._squaretableImport.original).toEqual(fixture.original);
        expect(result.cardData.extensions).toEqual((fixture.original.data ?? fixture.original).extensions);
        expect(createCharacterSchema.safeParse(result).success).toBe(true);
      }
    });
  }

  it('rejects large input before parsing', async () => {
    await expect(parseCharacterFile(new Uint8Array(MAX_CHARACTER_FILE_BYTES + 1))).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('rejects invalid UTF-8 rather than replacing bytes in a card field', async () => {
    const bytes = Buffer.concat([Buffer.from('{"name":"'), Buffer.from([255]), Buffer.from('","first_mes":""}')]);
    await expect(parseCharacterFile(bytes)).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('keeps the envelope version authoritative while retaining conflicting raw fields', async () => {
    const input = { ...cardV3, data: { ...cardV3.data, spec: 'chara_card_v2', data: { author_extra: true } } };
    const result = (await parseCharacterFile(Buffer.from(JSON.stringify(input)))).character;
    expect(result.cardData.spec).toBe('chara_card_v3');
    expect(result.cardData.data).toEqual(input.data);
    expect(result.cardData._squaretableImport.original).toEqual(input);
  });

  it.each([null, [], false, { name: 'bad', description: 1 }, { name: 'bad', first_mes: '', tags: [1] }])('validates malformed shapes without throwing: %j', input => {
    expect(validateSillyTavernFormat(input).valid).toBe(false);
  });

  it('does not downgrade selected V3 or lose author fields on export/reimport', async () => {
    const source = pngWithMetadata([textMetadata('ccv3', cardV3)]);
    const imported = (await parseCharacterFile(source)).character;
    const edited = { ...characterCardExportData(imported.cardData), name: 'Edited', first_mes: 'New greeting' };
    const exported = embedJsonInPng(source, edited);
    const result = (await parseCharacterFile(exported)).character;
    expect(result.name).toBe('Edited');
    expect(result.cardData.first_mes).toBe('New greeting');
    expect(result.cardData.extensions).toEqual(cardV3.data.extensions);
    expect(result.cardData._squaretableImport.original._squaretableImport).toBeUndefined();
    expect(result.cardData.root_extra).toBe(cardV3.root_extra);
    expect(result.cardData.character_book).toEqual(cardV3.data.character_book);
  });

  it('accepts the exact decompressed limit without rejecting a valid padded JSON payload', async () => {
    const json = Buffer.from(JSON.stringify(cardV3));
    const padded = Buffer.concat([json, Buffer.alloc(MAX_CHARACTER_METADATA_BYTES / 4 * 3 - json.length, 32)]);
    const encoded = Buffer.from(padded.toString('base64'));
    expect(encoded.byteLength).toBe(MAX_CHARACTER_METADATA_BYTES);
    const bytes = pngWithMetadata([textMetadata('ccv3', null, { type: 'zTXt', compressedBytes: deflateSync(encoded) })]);
    expect((await parseCharacterFile(bytes)).character.cardData._squaretableImport.original).toEqual(cardV3);
  }, 15000);

  it('reports unavailable decompression without disabling ordinary card import', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      const compressed = pngWithMetadata([textMetadata('ccv3', cardV3, { type: 'zTXt' })]);
      await expect(parseCharacterFile(compressed)).rejects.toMatchObject({ code: 'UNSUPPORTED_COMPRESSION' });
      expect((await parseCharacterFile(Buffer.from(JSON.stringify(cardV3)))).character.name).toBe(cardV3.data.name);
    } finally { vi.unstubAllGlobals(); }
  });
});
