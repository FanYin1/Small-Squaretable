import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { tsImport } from 'tsx/esm/api';
import { EngineeringBudget } from './lib/engineering-model-budget.mjs';
import { readPresentationWorkerConfig } from './lib/presentation-worker-config.mjs';
import { readPresentationReceipt } from './lib/presentation-receipts.mjs';
import { decodePresentationResponse, presentationRequest } from './lib/presentation-queue-provider.mjs';

async function main() {
  const [command, ...argumentsList] = process.argv.slice(2);
  const required = command === 'audit' ? ['--config', '--ledger'] : ['--config', '--ledger', '--receipt', '--job'];
  if (command === 'apply') required.push('--fingerprint');
  if (!['audit', 'plan', 'apply'].includes(command)) throw new Error('PRESENTATION_RECONCILIATION_ARGUMENTS');
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    if (!required.includes(key) || options[key] || !argumentsList[index + 1]) throw new Error('PRESENTATION_RECONCILIATION_ARGUMENTS');
    options[key] = argumentsList[index + 1];
  }
  if (required.some(key => !options[key])) throw new Error('PRESENTATION_RECONCILIATION_ARGUMENTS');
  const settings = await readPresentationWorkerConfig(options['--config']);
  const { ledger } = await new EngineeringBudget(options['--ledger']).inspect();
  if (ledger.id !== settings.ENGINEERING_MODEL_GATEWAY_LEDGER_ID) throw new Error('PRESENTATION_RECONCILIATION_CONFIG_MISMATCH');
  process.env.DATABASE_URL = settings.PRESENTATION_WORKER_DATABASE_URL;
  const { reconcilePresentationJob, auditPresentationReconciliation } = await tsImport('../src/server/services/presentation-reconciliation.service.ts', import.meta.url);
  const sql = postgres(settings.PRESENTATION_WORKER_DATABASE_URL, { max: 1, idle_timeout: 5, connect_timeout: 5 });
  try {
    if (command === 'audit') {
      const result = await auditPresentationReconciliation(drizzle(sql), { userId: settings.PRESENTATION_WORKER_USER_ID, tenantId: settings.PRESENTATION_WORKER_TENANT_ID });
      console.info(JSON.stringify({ scope: 'latest-100-owner-unresolved-or-stopped-jobs', limited: result.limited,
        jobs: result.jobs.map(job => {
          const request = ledger.requests.find(item => item.id === job.dispatchId);
          const matches = !job.usage || job.usage.ledgerId === ledger.id && job.usage.batchId === request?.batchId
            && job.usage.tokens === request?.actual && `sha256:${job.usage.responseDigest}` === request?.receiptEvidence;
          return { jobId: job.jobId, status: job.status, dispatchId: job.dispatchId, localUsageRecorded: Boolean(job.usage),
            billing: !matches ? 'conflict' : !request ? 'not-in-ledger' : request.status,
            tokens: request?.actual ?? null, reservation: request?.reservation ?? null };
        }), paidCalls: 0, writes: 0 }));
      return;
    }
    const { receipt, actualTokens } = await readPresentationReceipt(options['--receipt'], ledger);
    if (receipt.ledgerId !== settings.ENGINEERING_MODEL_GATEWAY_LEDGER_ID || receipt.batchId !== settings.ENGINEERING_MODEL_GATEWAY_BATCH_ID
      || receipt.model !== settings.CUSTOM_LLM_DEFAULT_MODEL || receipt.format !== settings.CUSTOM_LLM_API_FORMAT) throw new Error('PRESENTATION_RECONCILIATION_CONFIG_MISMATCH');
    const adapter = receipt.format === 'gemini' ? await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url) : null;
    const decoded = await decodePresentationResponse(receipt.body, receipt.model, receipt.format, adapter);
    if (decoded.tokens !== actualTokens) throw new Error('PRESENTATION_RECONCILIATION_USAGE_MISMATCH');
    const result = await reconcilePresentationJob(drizzle(sql), { jobId: options['--job'],
      userId: settings.PRESENTATION_WORKER_USER_ID, tenantId: settings.PRESENTATION_WORKER_TENANT_ID }, {
      dispatchId: receipt.dispatchId, selection: decoded.selection, requestDigest: receipt.requestDigest,
      digestPrompt: prompt => presentationRequest(prompt, receipt.model, receipt.format, adapter).digest,
      usage: { ledgerId: receipt.ledgerId, batchId: receipt.batchId, tokens: decoded.tokens, responseDigest: receipt.responseDigest },
    }, options['--fingerprint']);
    console.info(JSON.stringify(result));
  } finally { await sql.end({ timeout: 5 }); }
}

main().catch(error => {
  const code = /^PRESENTATION_[A-Z_]+$/.test(error.message) ? error.message : 'PRESENTATION_RECONCILIATION_FAILED';
  const databaseCode = error.cause?.code ?? error.code;
  console.error(JSON.stringify({ error: code, ...(/^[0-9A-Z]{5}$/.test(databaseCode ?? '') ? { databaseCode } : {}) })); process.exitCode = 1;
});
