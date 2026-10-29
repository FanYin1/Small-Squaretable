import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'dotenv';
import { EngineeringBudget, BudgetError } from './lib/engineering-model-budget.mjs';
import { createEngineeringGateway } from './lib/engineering-model-gateway.mjs';

async function main() {
  const [command, ...argumentsList] = process.argv.slice(2);
  const argumentsMap = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    if (!key?.startsWith('--') || !argumentsList[index + 1] || argumentsMap[key]) throw new BudgetError('BUDGET_ARGUMENTS_INVALID');
    argumentsMap[key] = argumentsList[index + 1];
  }
  const allowed = {
    init: ['--ledger', '--policy'], status: ['--ledger'], open: ['--ledger', '--batch-policy'],
    close: ['--ledger', '--batch'], settle: ['--ledger', '--receipt'],
    serve: ['--ledger', '--batch', '--config', '--output', '--max-input-bytes', '--max-output-tokens'],
  }[command];
  const required = command === 'serve' ? allowed?.filter(key => !['--max-input-bytes', '--max-output-tokens'].includes(key)) : allowed;
  if (!allowed || required.some(key => !argumentsMap[key]) || Object.keys(argumentsMap).some(key => !allowed.includes(key))) throw new BudgetError('BUDGET_ARGUMENTS_INVALID');
  const ledgerPath = resolve(argumentsMap['--ledger']);
  if (command === 'init') await mkdir(dirname(ledgerPath), { mode: 0o700, recursive: true });
  const budget = new EngineeringBudget(ledgerPath);
  const json = async key => JSON.parse(await readFile(argumentsMap[key], 'utf8'));
  if (command === 'init') {
    const policy = await json('--policy');
    if (policy.authorization !== 1_450_000 || policy.history?.known !== 448_496 || policy.history?.unreceipted < 6591
      || !policy.history?.hasUnboundedUnknown && !(policy.history?.unknownHold > 0 && policy.history?.unknownBoundEvidence)) throw new BudgetError('BUDGET_HISTORICAL_BASELINE_REQUIRED');
    console.info(JSON.stringify(await budget.initialize(policy))); return;
  }
  if (command === 'status') { console.info(JSON.stringify((await budget.read()).summary)); return; }
  if (command === 'open') { console.info(JSON.stringify(await budget.createBatch(await json('--batch-policy')))); return; }
  if (command === 'close') { console.info(JSON.stringify(await budget.closeBatch(argumentsMap['--batch']))); return; }
  if (command === 'settle') {
    const receipt = await json('--receipt');
    console.info(JSON.stringify(await budget.settle(receipt.requestId, receipt.actualTokens, receipt.evidence))); return;
  }
  const lockPath = `${ledgerPath}.gateway.lock`;
  const lock = await open(lockPath, 'wx', 0o600);
  let gateway;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })); await lock.sync();
    const configuration = parse(await readFile(argumentsMap['--config']));
    const modelLimits = JSON.stringify(JSON.parse(configuration.CUSTOM_LLM_MODEL_LIMITS || '{}'));
    if (/[\r\n']/.test(modelLimits)) throw new BudgetError('BUDGET_ARGUMENTS_INVALID');
    const maxInputBytes = argumentsMap['--max-input-bytes'] === undefined ? 65_536 : Number(argumentsMap['--max-input-bytes']);
    const maxOutputTokens = argumentsMap['--max-output-tokens'] === undefined ? 4096 : Number(argumentsMap['--max-output-tokens']);
    if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 1024 || maxInputBytes > 1_048_576
      || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 64_000) {
      throw new BudgetError('BUDGET_GATEWAY_LIMIT_INVALID');
    }
    const token = randomBytes(32).toString('base64url');
    const models = (configuration.CUSTOM_LLM_MODELS || configuration.CUSTOM_LLM_DEFAULT_MODEL || '').split(',').map(model => model.trim()).filter(Boolean);
    const format = configuration.CUSTOM_LLM_API_FORMAT || 'openai';
    gateway = await createEngineeringGateway({ budget, batchId: argumentsMap['--batch'], token,
      settings: { format, models, baseUrl: configuration.CUSTOM_LLM_BASE_URL, apiKey: configuration.CUSTOM_LLM_API_KEY },
      maxInputBytes, maxOutputTokens });
    gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening');
    const output = await open(argumentsMap['--output'], 'wx', 0o600);
    try {
      const ledgerId = (await budget.read()).ledger.id;
      await output.writeFile([
        `ENGINEERING_MODEL_GATEWAY_LEDGER_ID=${ledgerId}`,
        `ENGINEERING_MODEL_GATEWAY_BATCH_ID=${argumentsMap['--batch']}`,
        `CUSTOM_LLM_API_FORMAT=${format}`,
        `CUSTOM_LLM_BASE_URL=http://127.0.0.1:${gateway.server.address().port}/${format === 'gemini' ? 'v1beta' : 'v1'}`,
        `CUSTOM_LLM_API_KEY=${token}`,
        `CUSTOM_LLM_MODELS=${JSON.stringify(models.join(','))}`,
        `CUSTOM_LLM_DEFAULT_MODEL=${JSON.stringify(configuration.CUSTOM_LLM_DEFAULT_MODEL || models[0])}`,
        `CUSTOM_LLM_MODEL_LIMITS='${modelLimits}'`,
        '',
      ].join('\n')); await output.sync();
    } finally { await output.close(); }
    console.info(JSON.stringify({ status: 'engineering-gateway-ready', host: '127.0.0.1', port: gateway.server.address().port,
      batchId: argumentsMap['--batch'], ledgerId: (await budget.read()).ledger.id, maxInputBytes, maxOutputTokens, paidCallsMadeByStartup: 0 }));
    await new Promise(resolveSignal => {
      const stop = () => { process.off('SIGTERM', stop); process.off('SIGINT', stop); resolveSignal(); };
      process.once('SIGTERM', stop); process.once('SIGINT', stop);
    });
  } finally {
    if (gateway) await gateway.stop();
    await lock.close(); await rm(lockPath);
  }
}

main().catch(error => {
  console.error(JSON.stringify({ error: error instanceof BudgetError ? error.code : 'BUDGET_COMMAND_FAILED' }));
  process.exitCode = 1;
});
