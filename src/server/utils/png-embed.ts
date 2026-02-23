import { Buffer } from 'buffer';
import * as zlib from 'zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Pre-computed CRC32 table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

// CRC32 implementation for PNG chunks
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * Create a minimal 1x1 transparent PNG as a fallback when no avatar is available.
 */
function createMinimalPng(): Buffer {
  // IHDR chunk: 1x1, 8-bit RGBA
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);  // width
  ihdr.writeUInt32BE(1, 4);  // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)

  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk: single transparent pixel
  const raw = Buffer.from([0, 0, 0, 0, 0]); // filter byte + RGBA
  const compressed = zlib.deflateSync(raw);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Embed character JSON into a PNG file as a tEXt chunk with keyword 'chara'.
 * The JSON is base64-encoded before embedding (SillyTavern format).
 */
export function embedJsonInPng(pngBuffer: Buffer, characterJson: Record<string, unknown>): Buffer {
  const jsonStr = JSON.stringify(characterJson);
  const base64 = Buffer.from(jsonStr).toString('base64');

  // Create tEXt chunk: keyword + null separator + text
  const keyword = Buffer.from('chara', 'ascii');
  const nullSep = Buffer.from([0]);
  const textData = Buffer.from(base64, 'ascii');
  const chunkData = Buffer.concat([keyword, nullSep, textData]);
  const textChunk = createChunk('tEXt', chunkData);

  // Insert tEXt chunk before IEND (last chunk)
  let pos = 8; // skip signature
  while (pos < pngBuffer.length) {
    const chunkLength = pngBuffer.readUInt32BE(pos);
    const chunkType = pngBuffer.slice(pos + 4, pos + 8).toString('ascii');
    if (chunkType === 'IEND') {
      const before = pngBuffer.slice(0, pos);
      const after = pngBuffer.slice(pos);
      return Buffer.concat([before, textChunk, after]);
    }
    pos += 12 + chunkLength; // length(4) + type(4) + data + crc(4)
  }

  // Fallback: append before end
  return Buffer.concat([pngBuffer, textChunk]);
}

/**
 * Convert a base64 data URL to a Buffer, or return a minimal PNG.
 */
export function avatarToBuffer(avatarUrl: string | null | undefined): Buffer {
  if (!avatarUrl) return createMinimalPng();

  if (avatarUrl.startsWith('data:image/png;base64,')) {
    return Buffer.from(avatarUrl.replace('data:image/png;base64,', ''), 'base64');
  }
  if (avatarUrl.startsWith('data:image/')) {
    // For non-PNG data URLs, return minimal PNG (can't embed in non-PNG)
    return createMinimalPng();
  }

  return createMinimalPng();
}
