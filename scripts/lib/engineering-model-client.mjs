import { BudgetError } from './engineering-model-budget.mjs';

export async function requireEngineeringGateway(settings) {
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if (!uuid.test(settings.ENGINEERING_MODEL_GATEWAY_LEDGER_ID ?? '') || !uuid.test(settings.ENGINEERING_MODEL_GATEWAY_BATCH_ID ?? '')) {
    throw new BudgetError('ENGINEERING_GATEWAY_REQUIRED');
  }
  let base;
  try { base = new URL(settings.CUSTOM_LLM_BASE_URL); }
  catch { throw new BudgetError('ENGINEERING_GATEWAY_REQUIRED'); }
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.username || base.password || base.search || base.hash
    || !['/v1', '/v1beta'].includes(base.pathname) || typeof settings.CUSTOM_LLM_API_KEY !== 'string' || settings.CUSTOM_LLM_API_KEY.length < 24) {
    throw new BudgetError('ENGINEERING_GATEWAY_REQUIRED');
  }
  let result;
  try {
    const response = await fetch(`${base.origin}/__engineering/budget`, { method: 'GET', redirect: 'error',
      headers: { authorization: `Bearer ${settings.CUSTOM_LLM_API_KEY}` }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch { throw new BudgetError('ENGINEERING_GATEWAY_UNAVAILABLE'); }
  if (result.protocol !== 1 || result.ledgerId !== settings.ENGINEERING_MODEL_GATEWAY_LEDGER_ID
    || result.batch?.id !== settings.ENGINEERING_MODEL_GATEWAY_BATCH_ID || result.batch.closed
    || result.summary?.halted || result.summary?.pending || !Number.isSafeInteger(result.batch.maxTokens)
    || !Number.isSafeInteger(result.batch.occupied) || !Number.isSafeInteger(result.batch.maxRequests) || !Number.isSafeInteger(result.batch.requests)) {
    throw new BudgetError('ENGINEERING_GATEWAY_RECONCILIATION_REQUIRED');
  }
  return result;
}
