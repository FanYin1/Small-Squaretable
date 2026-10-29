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

export function importFromSillyTavern(stCharacter: SillyTavernCharacter | any): {
  name: string;
  description?: string;
  avatarUrl?: string;
  tags?: string[];
  cardData: Record<string, any>;
  isNsfw?: boolean;
} {
  const validation = validateSillyTavernFormat(stCharacter);
  if (!validation.valid) throw new CharacterCardImportError('INVALID_CARD');
  const normalized = normalizeSillyTavernData(stCharacter);

  // Extract avatar from data field if present
  const avatarUrl = normalized.avatar || normalized.data?.avatar;

  // Build cardData with all SillyTavern fields
  const cardData: Record<string, any> = {
    name: normalized.name,
    description: normalized.description ?? '',
    personality: normalized.personality ?? '',
    scenario: normalized.scenario ?? '',
    first_mes: normalized.first_mes ?? '',
    mes_example: normalized.mes_example ?? '',
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

  cardData._squaretableImport = { version: 1, original: stCharacter };

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
  return Boolean(isRecord(data) && data.spec === 'chara_card_v2' && isRecord(data.data) && data.data.name);
}

/**
 * Check if data is V3 format (data nested in 'data' block, spec is chara_card_v3)
 */
export function isV3Format(data: any): boolean {
  return Boolean(isRecord(data) && data.spec === 'chara_card_v3' && isRecord(data.data) && data.data.name);
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
          !['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'tags', 'creator', 'character_version', 'extensions', 'avatar', 'spec', 'spec_version', 'data'].includes(key)
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
export function validateSillyTavernFormat(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(data)) return { valid: false, errors: ['Expected a character object'] };
  if (data.spec !== undefined && !['chara_card_v2', 'chara_card_v3'].includes(String(data.spec))) {
    errors.push('Unsupported character specification');
  }
  if (data.spec_version !== undefined && typeof data.spec_version !== 'string') {
    errors.push('Invalid specification version');
  }
  const normalized = isV2Format(data) || isV3Format(data) ? data.data as Record<string, unknown> : data;
  if (typeof normalized.name !== 'string' || !normalized.name.trim()) errors.push('Missing character name');
  const narrativeFields = ['description', 'personality', 'scenario', 'first_mes', 'mes_example'];
  if (!narrativeFields.some(field => typeof normalized[field] === 'string')) {
    errors.push('No character fields found');
  }
  if (['entries', 'prompts', 'prompt_order', 'sampler_order'].some(field => field in normalized)
    && !['personality', 'scenario', 'first_mes', 'mes_example'].some(field => field in normalized)) {
    errors.push('World books and presets must use their own importer');
  }
  for (const field of [...narrativeFields, 'system_prompt', 'post_history_instructions']) {
    if (normalized[field] !== undefined && typeof normalized[field] !== 'string') errors.push(`Invalid ${field}`);
  }
  if (normalized.tags !== undefined && (!Array.isArray(normalized.tags) || !normalized.tags.every(tag => typeof tag === 'string'))) {
    errors.push('Invalid tags');
  }
  if (normalized.extensions !== undefined && !isRecord(normalized.extensions)) errors.push('Invalid extensions');
  return { valid: errors.length === 0, errors };
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const MAX_CHARACTER_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CHARACTER_METADATA_BYTES = 10 * 1024 * 1024;

export function characterCardExportData(cardData: Record<string, any>): Record<string, any> {
  const original = cardData._squaretableImport?.original;
  const fields = {
    ...(isRecord(original) ? original : {}),
    ...(isRecord(cardData.data) ? cardData.data : {}),
    ...cardData,
  };
  delete fields.data;
  delete fields._squaretableImport;
  return fields;
}

const importMessages = {
  UNSUPPORTED_FILE: 'File not recognized as a character card. Use a JSON or PNG character card.',
  NO_CARD_DATA: 'This image has no supported character data. Use character creation to upload a cover.',
  INVALID_JSON: 'Character JSON is invalid or is not UTF-8.',
  INVALID_CARD: 'Character fields are invalid or this is a different kind of JSON. Import world books separately.',
  INVALID_PNG: 'PNG structure or checksum is invalid. Re-export the original card.',
  INVALID_METADATA: 'Embedded character data is damaged. Re-export the original card.',
  UNSUPPORTED_COMPRESSION: 'This environment cannot decompress PNG character metadata. Export the card as JSON.',
  METADATA_TOO_LARGE: 'Decompressed character metadata exceeds the 10 MiB limit.',
  CONFLICTING_METADATA: 'Multiple conflicting character records were found. Export one version as JSON.',
  FILE_TOO_LARGE: 'Character file exceeds the 10 MiB import limit.',
} as const;

export type CharacterCardImportErrorCode = keyof typeof importMessages;

export class CharacterCardImportError extends Error {
  constructor(readonly code: CharacterCardImportErrorCode) {
    super(importMessages[code]);
    this.name = 'CharacterCardImportError';
  }
}

export function parseCharacterJson(bytes: Uint8Array) {
  checkSize(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CharacterCardImportError('INVALID_JSON');
  }
  return importFromSillyTavern(parsed);
}

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function checksum(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

function checkSize(bytes: Uint8Array) {
  if (bytes.length > MAX_CHARACTER_FILE_BYTES) throw new CharacterCardImportError('FILE_TOO_LARGE');
}

function decodeMetadata(bytes: Uint8Array): unknown {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
    if (!text || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw new Error();
    }
    const decoded = Uint8Array.from(atob(text), char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
  } catch {
    throw new CharacterCardImportError('INVALID_METADATA');
  }
}

async function decompressMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined' || typeof ReadableStream === 'undefined') {
    throw new CharacterCardImportError('UNSUPPORTED_COMPRESSION');
  }
  let offset = 0;
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      const end = Math.min(offset + 1024, bytes.length);
      controller.enqueue(new Uint8Array(bytes.subarray(offset, end)));
      offset = end;
    },
  });
  const reader = input.pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let done = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) { done = true; break; }
      length += result.value.byteLength;
      if (length > MAX_CHARACTER_METADATA_BYTES) throw new CharacterCardImportError('METADATA_TOO_LARGE');
      chunks.push(result.value);
    }
    const output = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) { output.set(chunk, position); position += chunk.byteLength; }
    return output;
  } catch (error) {
    if (error instanceof CharacterCardImportError) throw error;
    throw new CharacterCardImportError('INVALID_METADATA');
  } finally {
    if (!done) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function parseCharacterPng(bytes: Uint8Array) {
  checkSize(bytes);
  const invalid = () => new CharacterCardImportError('INVALID_PNG');
  if (!pngSignature.every((byte, index) => bytes[index] === byte)) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = new Map<string, { bytes: Uint8Array; compressed: boolean }>();
  let offset = 8;
  let hasImage = false;
  let ended = false;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw invalid();
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw invalid();
    const end = offset + 8 + length;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (checksum(bytes.subarray(offset + 4, end)) !== view.getUint32(end)) throw invalid();
    if (offset === 8 && (type !== 'IHDR' || length !== 13)) throw invalid();
    if (type === 'IHDR' && offset !== 8) throw invalid();
    if (type === 'IDAT') hasImage = true;
    if (['tEXt', 'iTXt', 'zTXt'].includes(type)) {
      const chunk = bytes.subarray(offset + 8, end);
      const separator = chunk.indexOf(0);
      const keyword = new TextDecoder().decode(separator < 0 ? chunk : chunk.subarray(0, separator));
      if (keyword === 'chara' || keyword === 'ccv3') {
        if (separator < 0) throw new CharacterCardImportError('INVALID_METADATA');
        let textStart = separator + 1;
        let compressed = type === 'zTXt';
        if (type === 'iTXt') {
          if (textStart + 2 > chunk.length || ![0, 1].includes(chunk[textStart]) || chunk[textStart + 1] !== 0) {
            throw new CharacterCardImportError('INVALID_METADATA');
          }
          compressed = chunk[textStart] === 1;
          textStart += 2;
          for (let field = 0; field < 2; field++) {
            const terminator = chunk.indexOf(0, textStart);
            if (terminator < 0) throw new CharacterCardImportError('INVALID_METADATA');
            textStart = terminator + 1;
          }
        } else if (type === 'zTXt') {
          if (chunk[textStart] !== 0) throw new CharacterCardImportError('INVALID_METADATA');
          textStart++;
        }
        const payload = chunk.subarray(textStart);
        const previous = records.get(keyword);
        if (previous && (previous.compressed !== compressed || previous.bytes.length !== payload.length || previous.bytes.some((byte, index) => byte !== payload[index]))) {
          throw new CharacterCardImportError('CONFLICTING_METADATA');
        }
        records.set(keyword, { bytes: payload, compressed });
      }
    }
    offset = end + 4;
    if (type === 'IEND') {
      if (length !== 0 || !hasImage || offset !== bytes.length) throw invalid();
      ended = true;
      break;
    }
  }
  if (!ended) throw invalid();
  const selected = records.get('ccv3') ?? records.get('chara');
  if (!selected) throw new CharacterCardImportError('NO_CARD_DATA');
  const metadata = selected.compressed ? await decompressMetadata(selected.bytes) : selected.bytes;
  const original = decodeMetadata(metadata);
  if (records.has('ccv3') && (!isRecord(original) || original.spec !== 'chara_card_v3')) {
    throw new CharacterCardImportError('INVALID_METADATA');
  }
  return importFromSillyTavern(original);
}

export async function parseCharacterFile(bytes: Uint8Array) {
  checkSize(bytes);
  if (pngSignature.every((byte, index) => bytes[index] === byte)) {
    return { format: 'png' as const, character: await parseCharacterPng(bytes) };
  }
  const prefix = new TextDecoder().decode(bytes.subarray(0, 4));
  if (bytes[0] === 137 && prefix.slice(1) === 'PNG') throw new CharacterCardImportError('INVALID_PNG');
  if ((bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    || (prefix === 'RIFF' && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP')) {
    throw new CharacterCardImportError('NO_CARD_DATA');
  }
  const start = new TextDecoder().decode(bytes).trimStart()[0];
  if (start === '{' || start === '[' || start === 'n') {
    return { format: 'json' as const, character: parseCharacterJson(bytes) };
  }
  throw new CharacterCardImportError('UNSUPPORTED_FILE');
}
