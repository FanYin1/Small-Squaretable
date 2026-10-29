import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

const tokens = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = tokens.refine(value => value > 0);
const uuid = z.string().uuid();
const reference = z.string().trim().min(1).max(500);
const batchSchema = z.object({
  id: uuid, scope: reference, maxTokens: positive, maxRequests: positive,
  closed: z.boolean(), createdAt: z.string(),
}).strict();
const requestSchema = z.object({
  id: uuid, batchId: uuid, digest: z.string().regex(/^[a-f0-9]{64}$/),
  reservation: positive, status: z.enum(['pending', 'unknown', 'settled']),
  actual: tokens.nullable(), reason: z.enum(['pending', 'receipt', 'transport', 'response', 'shutdown']),
  createdAt: z.string(), receiptEvidence: reference.optional(),
}).strict();
const ledgerSchema = z.object({
  version: z.literal(1), id: uuid, authorization: positive,
  history: z.object({
    known: tokens, unreceipted: tokens, unknownHold: tokens,
    unknownBoundEvidence: reference.nullable(), hasUnboundedUnknown: z.boolean(),
  }).strict(),
  batches: z.array(batchSchema), requests: z.array(requestSchema),
}).strict().superRefine((ledger, context) => {
  const batchIds = new Set(ledger.batches.map(batch => batch.id));
  if (batchIds.size !== ledger.batches.length || new Set(ledger.requests.map(request => request.id)).size !== ledger.requests.length
    || ledger.requests.some(request => !batchIds.has(request.batchId)
      || (request.status === 'settled') !== (request.actual !== null)
      || (request.status === 'settled') !== (request.reason === 'receipt'))
    || !ledger.history.hasUnboundedUnknown && ledger.history.unknownHold > 0 && !ledger.history.unknownBoundEvidence) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'BUDGET_LEDGER_INCONSISTENT' });
  }
});

export class BudgetError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const accounted = request => request.actual ?? request.reservation;
const sum = values => {
  const total = values.reduce((previous, value) => previous + value, 0);
  if (!Number.isSafeInteger(total)) throw new BudgetError('BUDGET_INTEGER_OVERFLOW');
  return total;
};
function batchUsage(ledger, batchId) {
  const requests = ledger.requests.filter(request => request.batchId === batchId);
  return { requests: requests.length, occupied: sum(requests.map(accounted)) };
}
export function budgetSummary(ledger) {
  ledgerSchema.parse(ledger);
  const historical = sum([ledger.history.known, ledger.history.unreceipted, ledger.history.unknownHold]);
  const occupied = sum([historical, ...ledger.batches.map(batch => {
    const used = batchUsage(ledger, batch.id).occupied;
    return batch.closed ? used : Math.max(batch.maxTokens, used);
  })]);
  const overrun = occupied > ledger.authorization || ledger.requests.some(request => request.actual !== null && request.actual > request.reservation)
    || ledger.batches.some(batch => batchUsage(ledger, batch.id).occupied > batch.maxTokens);
  const unknown = ledger.requests.filter(request => request.status === 'unknown').length;
  return { authorization: ledger.authorization, historical, occupied, available: Math.max(0, ledger.authorization - occupied),
    knownNewTokens: sum(ledger.requests.map(request => request.actual ?? 0)),
    heldNewTokens: sum(ledger.requests.filter(request => request.status !== 'settled').map(request => request.reservation)),
    pending: ledger.requests.filter(request => request.status === 'pending').length, unknown,
    halted: ledger.history.hasUnboundedUnknown || unknown > 0 || overrun,
    reason: ledger.history.hasUnboundedUnknown ? 'HISTORICAL_UNKNOWN_UNBOUNDED' : overrun ? 'USAGE_EXCEEDS_RESERVATION' : unknown ? 'REQUEST_USAGE_UNKNOWN' : null };
}

export class EngineeringBudget {
  constructor(path) { this.path = resolve(path); this.lockPath = `${this.path}.lock`; }

  async inspect() {
    const parent = await stat(dirname(this.path));
    if (!parent.isDirectory() || parent.mode & 0o077) throw new BudgetError('BUDGET_DIRECTORY_NOT_PRIVATE');
    const file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.mode & 0o077 || metadata.size > 4_000_000) throw new BudgetError('BUDGET_LEDGER_NOT_PRIVATE');
      const ledger = ledgerSchema.parse(JSON.parse(await file.readFile('utf8')));
      return { ledger, summary: budgetSummary(ledger) };
    } finally { await file.close(); }
  }

  async mutate(change, initialize = false) {
    const parent = await stat(dirname(this.path));
    if (!parent.isDirectory() || parent.mode & 0o077) throw new BudgetError('BUDGET_DIRECTORY_NOT_PRIVATE');
    let acquired = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await mkdir(this.lockPath, { mode: 0o700 }); acquired = true; break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await delay(10); }
    }
    if (!acquired) throw new BudgetError('BUDGET_LEDGER_LOCKED');
    let temporary;
    try {
      const owner = await open(`${this.lockPath}/owner.json`, 'wx', 0o600);
      try { await owner.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); await owner.sync(); }
      finally { await owner.close(); }
      let ledger;
      try {
        const file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const metadata = await file.stat();
          if (!metadata.isFile() || metadata.mode & 0o077 || metadata.size > 4_000_000) throw new BudgetError('BUDGET_LEDGER_NOT_PRIVATE');
          ledger = ledgerSchema.parse(JSON.parse(await file.readFile('utf8')));
        } finally { await file.close(); }
      } catch (error) { if (!initialize || error.code !== 'ENOENT') throw error; }
      const result = await change(ledger);
      const updated = ledgerSchema.parse(result.ledger);
      temporary = `${this.path}.${randomUUID()}.tmp`;
      const output = await open(temporary, 'wx', 0o600);
      try { await output.writeFile(`${JSON.stringify(updated, null, 2)}\n`); await output.sync(); }
      finally { await output.close(); }
      await rename(temporary, this.path);
      const directory = await open(dirname(this.path), constants.O_RDONLY);
      try { await directory.sync(); } finally { await directory.close(); }
      return result.value;
    } finally {
      if (temporary) await rm(temporary, { force: true });
      await rm(this.lockPath, { recursive: true });
    }
  }

  async initialize({ authorization, history }) {
    return this.mutate(existing => {
      if (existing) throw new BudgetError('BUDGET_ALREADY_INITIALIZED');
      const ledger = ledgerSchema.parse({ version: 1, id: randomUUID(), authorization, history, batches: [], requests: [] });
      if (budgetSummary(ledger).occupied > authorization) throw new BudgetError('BUDGET_HISTORY_EXCEEDS_AUTHORIZATION');
      return { ledger, value: budgetSummary(ledger) };
    }, true);
  }

  async read() {
    return this.mutate(ledger => ({ ledger, value: { ledger, summary: budgetSummary(ledger) } }));
  }

  async createBatch({ scope, maxTokens, maxRequests }) {
    return this.mutate(ledger => {
      const summary = budgetSummary(ledger);
      if (summary.halted || summary.pending) throw new BudgetError('BUDGET_RECONCILIATION_REQUIRED');
      const batch = batchSchema.parse({ id: randomUUID(), scope, maxTokens, maxRequests, closed: false, createdAt: new Date().toISOString() });
      if (batch.maxTokens > summary.available) throw new BudgetError('BUDGET_AUTHORIZATION_EXHAUSTED');
      ledger.batches.push(batch);
      return { ledger, value: batch };
    });
  }

  async reserve(batchId, reservation, digest, id = randomUUID()) {
    return this.mutate(ledger => {
      if (budgetSummary(ledger).halted) throw new BudgetError('BUDGET_RECONCILIATION_REQUIRED');
      const batch = ledger.batches.find(candidate => candidate.id === batchId);
      if (!batch || batch.closed) throw new BudgetError('BUDGET_BATCH_CLOSED');
      if (ledger.requests.some(request => request.id === id)) throw new BudgetError('BUDGET_REQUEST_ALREADY_DISPATCHED');
      const usage = batchUsage(ledger, batchId);
      const request = requestSchema.parse({ id, batchId, reservation, digest, status: 'pending', actual: null, reason: 'pending', createdAt: new Date().toISOString() });
      if (usage.requests >= batch.maxRequests || sum([usage.occupied, reservation]) > batch.maxTokens) throw new BudgetError('BUDGET_BATCH_EXHAUSTED');
      ledger.requests.push(request);
      return { ledger, value: request };
    });
  }

  async settle(id, actual, receiptEvidence) {
    tokens.parse(actual); reference.parse(receiptEvidence);
    return this.mutate(ledger => {
      const request = ledger.requests.find(candidate => candidate.id === id);
      if (!request) throw new BudgetError('BUDGET_REQUEST_NOT_FOUND');
      if (request.status === 'settled') {
        if (request.actual !== actual || request.receiptEvidence !== receiptEvidence) throw new BudgetError('BUDGET_RECEIPT_CONFLICT');
      } else Object.assign(request, { status: 'settled', actual, reason: 'receipt', receiptEvidence });
      return { ledger, value: budgetSummary(ledger) };
    });
  }

  async unknown(id, reason = 'transport') {
    return this.mutate(ledger => {
      const request = ledger.requests.find(candidate => candidate.id === id);
      if (!request) throw new BudgetError('BUDGET_REQUEST_NOT_FOUND');
      if (request.status !== 'settled') { request.status = 'unknown'; request.reason = reason; }
      return { ledger, value: budgetSummary(ledger) };
    });
  }

  async closeBatch(batchId) {
    return this.mutate(ledger => {
      const batch = ledger.batches.find(candidate => candidate.id === batchId);
      if (!batch) throw new BudgetError('BUDGET_BATCH_NOT_FOUND');
      if (ledger.requests.some(request => request.batchId === batchId && request.status === 'pending')) throw new BudgetError('BUDGET_PENDING_REQUEST');
      batch.closed = true;
      return { ledger, value: budgetSummary(ledger) };
    });
  }
}

export const requestDigest = body => createHash('sha256').update(body).digest('hex');

