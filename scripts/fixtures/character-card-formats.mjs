import { deflateSync, deflateRawSync, gzipSync } from 'node:zlib';

function chunk(type, payload) {
  const data = Buffer.from(payload);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length);
  header.write(type, 4, 'ascii');
  let checksum = 0xffffffff;
  for (const byte of Buffer.concat([header.subarray(4), data])) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  }
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((checksum ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, data, crc]);
}

export const cardV1 = {
  name: '合成旅人', description: '用于导入回归的合成卡。', first_mes: '欢迎来到码头。', tags: ['回归'],
  extensions: { unknown_author_field: { enabled: true, values: [1, '保留'] } },
};
export const cardV2 = { spec: 'chara_card_v2', spec_version: '2.0', root_extra: '保留根字段', data: cardV1 };
export const cardV3 = { spec: 'chara_card_v3', spec_version: '3.0', root_extra: '保留根字段', data: {
  ...cardV1, name: '合成旅人 V3', group_only_greetings: ['你好'],
  character_book: { name: '码头知识', entries: [{ keys: ['码头'], content: '码头每天开门。', enabled: true }] },
} };

export function textMetadata(keyword, value, options = {}) {
  const text = Buffer.from(options.raw ?? Buffer.from(JSON.stringify(value)).toString('base64'));
  const type = options.type ?? 'tEXt';
  let payload;
  if (type === 'iTXt') {
    payload = Buffer.concat([Buffer.from(`${keyword}\0`), Buffer.from([options.compressed ? 1 : 0, options.method ?? 0]),
      Buffer.from('zh-CN\0角色设定\0'), options.compressed ? (options.compressedBytes ?? deflateSync(text)) : text]);
  } else if (type === 'zTXt') {
    payload = Buffer.concat([Buffer.from(`${keyword}\0`), Buffer.from([options.method ?? 0]), options.compressedBytes ?? deflateSync(text)]);
  } else {
    payload = Buffer.concat([Buffer.from(`${keyword}\0`), text]);
  }
  return chunk(type, payload);
}

export function pngWithMetadata(records = []) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0]))), ...records, chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function formatCases() {
  const corruptCrc = pngWithMetadata([textMetadata('chara', cardV2)]);
  corruptCrc[corruptCrc.length - 15] ^= 1;
  const truncated = pngWithMetadata([textMetadata('chara', cardV2)]).subarray(0, -3);
  const oversizedChunk = pngWithMetadata();
  oversizedChunk.writeUInt32BE(0xffffffff, 8);
  const encoded = Buffer.from(Buffer.from(JSON.stringify(cardV3)).toString('base64'));
  const compressed = deflateSync(encoded);
  const badChecksum = Buffer.from(compressed);
  badChecksum[badChecksum.length - 1] ^= 1;
  const packed = (payload, keyword = 'ccv3', type = 'iTXt') => textMetadata(keyword, null, { type, compressed: true, compressedBytes: payload });
  return [
    { name: 'legacy.json', bytes: Buffer.from(JSON.stringify(cardV1)), original: cardV1 },
    { name: 'wrapped.json', bytes: Buffer.from(JSON.stringify(cardV2)), original: cardV2 },
    { name: 'bom-whitespace.txt', bytes: Buffer.from('\ufeff \n\t' + JSON.stringify(cardV3)), original: cardV3 },
    { name: 'actually-png.jpg', bytes: pngWithMetadata([textMetadata('chara', cardV2)]), original: cardV2 },
    { name: 'v3-only.png', bytes: pngWithMetadata([textMetadata('ccv3', cardV3)]), original: cardV3 },
    { name: 'dual.png', bytes: pngWithMetadata([textMetadata('chara', cardV2), textMetadata('ccv3', cardV3)]), original: cardV3 },
    { name: 'international.png', bytes: pngWithMetadata([textMetadata('ccv3', cardV3, { type: 'iTXt' })]), original: cardV3 },
    { name: 'legacy-international.png', bytes: pngWithMetadata([textMetadata('chara', cardV2, { type: 'iTXt' })]), original: cardV2 },
    { name: 'same-duplicate.png', bytes: pngWithMetadata([textMetadata('chara', cardV2), textMetadata('chara', cardV2)]), original: cardV2 },
    { name: 'not-an-image.png', bytes: Buffer.from('arbitrary content'), code: 'UNSUPPORTED_FILE' },
    { name: 'wave.webp', bytes: Buffer.from('RIFFxxxxWAVExxxx'), code: 'UNSUPPORTED_FILE' },
    { name: 'cover.webp', bytes: Buffer.from('RIFFxxxxWEBPxxxx'), code: 'NO_CARD_DATA' },
    { name: 'cover.jpg', bytes: Buffer.from([255, 216, 255, 224]), code: 'NO_CARD_DATA' },
    { name: 'cover.png', bytes: pngWithMetadata(), code: 'NO_CARD_DATA' },
    { name: 'corrupt-crc.png', bytes: corruptCrc, code: 'INVALID_PNG' },
    { name: 'truncated.png', bytes: truncated, code: 'INVALID_PNG' },
    { name: 'huge-chunk.png', bytes: oversizedChunk, code: 'INVALID_PNG' },
    { name: 'invalid-base64.png', bytes: pngWithMetadata([textMetadata('chara', null, { raw: '%%%notbase64%%%' })]), code: 'INVALID_METADATA' },
    { name: 'compressed.png', bytes: pngWithMetadata([textMetadata('chara', cardV2, { type: 'iTXt', compressed: true })]), original: cardV2 },
    { name: 'ztext.png', bytes: pngWithMetadata([textMetadata('chara', cardV2, { type: 'zTXt' })]), original: cardV2 },
    { name: 'compressed-v3.png', bytes: pngWithMetadata([packed(compressed)]), original: cardV3 },
    { name: 'ztext-v3.png', bytes: pngWithMetadata([packed(compressed, 'ccv3', 'zTXt')]), original: cardV3 },
    { name: 'truncated-deflate.png', bytes: pngWithMetadata([packed(compressed.subarray(0, -3))]), code: 'INVALID_METADATA' },
    { name: 'bad-zlib-checksum.png', bytes: pngWithMetadata([packed(badChecksum)]), code: 'INVALID_METADATA' },
    { name: 'gzip-instead-of-zlib.png', bytes: pngWithMetadata([packed(gzipSync(encoded))]), code: 'INVALID_METADATA' },
    { name: 'raw-instead-of-zlib.png', bytes: pngWithMetadata([packed(deflateRawSync(encoded))]), code: 'INVALID_METADATA' },
    { name: 'trailing-zlib.png', bytes: pngWithMetadata([packed(Buffer.concat([compressed, Buffer.from('extra')]))]), code: 'INVALID_METADATA' },
    { name: 'compressed-invalid-text.png', bytes: pngWithMetadata([packed(deflateSync(Buffer.from([255])))]), code: 'INVALID_METADATA' },
    { name: 'compressed-method.png', bytes: pngWithMetadata([textMetadata('chara', cardV2, { type: 'iTXt', compressed: true, method: 1 })]), code: 'INVALID_METADATA' },
    { name: 'compressed-over-limit.png', bytes: pngWithMetadata([packed(deflateSync(Buffer.alloc(10 * 1024 * 1024 + 1, 65)))]), code: 'METADATA_TOO_LARGE' },
    { name: 'compressed-v3-no-fallback.png', bytes: pngWithMetadata([textMetadata('chara', cardV2), packed(badChecksum)]), code: 'INVALID_METADATA' },
    { name: 'conflicting.png', bytes: pngWithMetadata([textMetadata('chara', cardV2), textMetadata('chara', cardV3)]), code: 'CONFLICTING_METADATA' },
    { name: 'corrupt-v3.png', bytes: pngWithMetadata([textMetadata('chara', cardV2), textMetadata('ccv3', null, { raw: 'invalid' })]), code: 'INVALID_METADATA' },
    { name: 'mislabeled-v3.png', bytes: pngWithMetadata([textMetadata('ccv3', cardV2)]), code: 'INVALID_METADATA' },
    { name: 'worldbook.json', bytes: Buffer.from(JSON.stringify({ name: '知识', description: '常识', entries: [] })), code: 'INVALID_CARD' },
    { name: 'preset.json', bytes: Buffer.from(JSON.stringify({ name: '预设', description: '补充', prompts: [], prompt_order: [] })), code: 'INVALID_CARD' },
    { name: 'null.json', bytes: Buffer.from('null'), code: 'INVALID_CARD' },
    { name: 'array.json', bytes: Buffer.from('[]'), code: 'INVALID_CARD' },
    { name: 'name-only.json', bytes: Buffer.from('{"name":"not-a-card"}'), code: 'INVALID_CARD' },
    { name: 'malformed.json', bytes: Buffer.from('{"name":'), code: 'INVALID_JSON' },
    { name: 'future.json', bytes: Buffer.from(JSON.stringify({ ...cardV2, spec: 'chara_card_v9' })), code: 'INVALID_CARD' },
  ];
}
