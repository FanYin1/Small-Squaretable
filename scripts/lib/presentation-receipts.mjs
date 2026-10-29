import { constants } from 'node:fs';
import { open, mkdir, lstat, link, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requestDigest } from './engineering-model-budget.mjs';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z.object({
  version: z.literal(1), dispatchId: z.string().uuid(), ledgerId: z.string().uuid(), batchId: z.string().uuid(),
  format: z.enum(['openai', 'gemini']), model: z.string().min(1).max(200), requestDigest: digest,
  responseDigest: digest, body: z.string().max(65_536),
}).strict();

export async function readPrivateFile(path, maxBytes) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.mode & 0o077 || metadata.size > maxBytes) throw new Error('PRESENTATION_PRIVATE_FILE_REQUIRED');
    const body = await file.readFile('utf8');
    if (Buffer.byteLength(body) > maxBytes) throw new Error('PRESENTATION_FILE_LIMIT');
    return body;
  } finally { await file.close(); }
}

export async function prepareReceiptDirectory(path) {
  const directory = resolve(path);
  await mkdir(directory, { mode: 0o700 });
  return directory;
}

export async function verifyReceiptDirectory(path) {
  const directory = resolve(path);
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.mode & 0o077) throw new Error('PRESENTATION_RECEIPT_DIRECTORY_PRIVATE');
  return directory;
}

export async function savePresentationReceipt(directory, value) {
  const receipt = receiptSchema.parse(value);
  if (Buffer.byteLength(receipt.body) > 65_536 || requestDigest(receipt.body) !== receipt.responseDigest) throw new Error('PRESENTATION_RECEIPT_INVALID');
  const root = await verifyReceiptDirectory(directory);
  const destination = join(root, `${receipt.dispatchId}.json`);
  const temporary = join(root, `.${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(receipt));
    await file.sync();
    await file.close();
    await link(temporary, destination);
    const parent = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await parent.sync(); } finally { await parent.close(); }
  } finally { await file.close(); await rm(temporary, { force: true }); }
  return destination;
}

export async function readPresentationReceipt(path, ledger) {
  const receipt = receiptSchema.parse(JSON.parse(await readPrivateFile(path, 400_000)));
  const request = ledger.requests.find(candidate => candidate.id === receipt.dispatchId);
  if (receipt.ledgerId !== ledger.id || !request || request.batchId !== receipt.batchId
    || request.digest !== receipt.requestDigest || request.status !== 'settled'
    || request.receiptEvidence !== `sha256:${receipt.responseDigest}` || requestDigest(receipt.body) !== receipt.responseDigest
    || Buffer.byteLength(receipt.body) > 65_536) throw new Error('PRESENTATION_LEDGER_RECEIPT_MISMATCH');
  return { receipt, actualTokens: request.actual };
}
