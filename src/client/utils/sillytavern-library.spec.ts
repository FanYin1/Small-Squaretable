import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readCharacterPng } from './sillytavern';

const sampleRoot = process.env.CARD_LIBRARY_SAMPLE_ROOT;
const samples = [
  '已分类/2025年3月前/正常向(不分类)/冒险者公会的宝物鉴定师.png',
  '已分类/世界卡/异世界，奇幻/冒险者公会模拟器.png',
  '已分类/世界卡/异世界，奇幻/异世界冒险团2.1.1.png',
];

function sourceMetadata(bytes: Buffer) {
  let offset = 8;
  let original;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    expect(offset + length + 12).toBeLessThanOrEqual(bytes.length);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (kind === 'tEXt' && ['chara\0', 'ccv3\0'].some(keyword => chunk.toString('ascii').startsWith(keyword))) {
      const separator = chunk.indexOf(0);
      const parsed = JSON.parse(Buffer.from(chunk.subarray(separator + 1).toString(), 'base64').toString('utf8'));
      if (chunk.toString('ascii', 0, separator) === 'ccv3') return parsed;
      original = parsed;
    }
    offset += length + 12;
  }
  if (original) return original;
  throw new Error('Selected sample requires card tEXt metadata');
}

describe.skipIf(!sampleRoot)('Local character library: browser parsing and field preservation', () => {
  beforeAll(() => vi.stubGlobal('URL', { createObjectURL: () => 'blob:local-card-test' }));
  afterAll(() => vi.unstubAllGlobals());

  for (const relative of samples) {
    it(relative, async () => {
      const bytes = await readFile(join(sampleRoot!, relative));
      const original = sourceMetadata(bytes);
      const card = await readCharacterPng(new File([new Uint8Array(bytes)], 'sample.png', { type: 'image/png' }));
      const source = original.data ?? original;
      expect(card.name).toBe(source.name);
      for (const field of ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system_prompt',
        'post_history_instructions', 'alternate_greetings', 'character_book', 'extensions']) {
        if (source[field] !== undefined) expect(card.cardData[field]).toEqual(source[field]);
      }
      expect(card.cardData.data).toEqual(original.data);
      expect(card.cardData.spec).toBe(original.spec);
      expect(card.cardData._squaretableImport.original).toEqual(original);
    });
  }
});
