import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'dotenv';
import { tsImport } from 'tsx/esm/api';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

async function main() {
  const [mode, ...argumentsList] = process.argv.slice(2);
  const required = mode === 'inspect' ? ['--card', '--output'] : mode === 'draft' ? ['--config', '--card', '--output']
    : mode === 'verify' ? ['--card', '--draft', '--output'] : [];
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    if (!required.includes(key) || !argumentsList[index + 1] || options[key]) throw new Error('PRESENTATION_ARGUMENTS_INVALID');
    options[key] = argumentsList[index + 1];
  }
  if (!required.length || required.some(key => !options[key])) throw new Error('PRESENTATION_ARGUMENTS_INVALID');
  const settings = mode === 'draft' ? parse(await readFile(options['--config'])) : null;
  const gateway = settings ? await requireEngineeringGateway(settings) : null;
  const cardPath = resolve(options['--card']);
  const metadata = await stat(cardPath);
  if (!metadata.isFile() || metadata.size > 12 * 1024 * 1024) throw new Error('PRESENTATION_FILE_LIMIT');
  const outputPath = resolve(options['--output']);
  const parent = await stat(dirname(outputPath));
  if (!parent.isDirectory() || parent.mode & 0o077) throw new Error('PRESENTATION_DIRECTORY_NOT_PRIVATE');
  const output = await open(outputPath, 'wx', 0o600);
  const report = { version: 1, mode, at: new Date().toISOString(), result: 'pending', modelCalls: 0, productAdopted: false,
    ledgerId: gateway?.ledgerId ?? null, batchId: gateway?.batch.id ?? null };
  const persist = async () => {
    await output.truncate(0);
    await output.write(`${JSON.stringify(report, null, 2)}\n`, 0, 'utf8'); await output.sync();
  };
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    await persist();
    const { parseCharacterFile } = await tsImport('../src/types/character-card-import.ts', import.meta.url);
    const { collectPresentationSources, revalidatePresentationDraft, runPresentationGraph } = await tsImport('../src/server/services/story-presentation-workflow.ts', import.meta.url);
    const bytes = await readFile(cardPath);
    report.cardDigest = createHash('sha256').update(bytes).digest('hex');
    const imported = (await parseCharacterFile(bytes)).character;
    let previous;
    if (mode === 'verify') {
      const draftMetadata = await stat(options['--draft']);
      if (!draftMetadata.isFile() || draftMetadata.size > 64 * 1024) throw new Error('PRESENTATION_DRAFT_INVALID');
      previous = JSON.parse(await readFile(options['--draft'], 'utf8'));
      if (previous.cardDigest !== report.cardDigest || !['draft', 'preserved', 'unavailable'].includes(previous.result)) throw new Error('PRESENTATION_SOURCE_STALE');
    }
    const character = { id: previous?.draft?.characterId ?? randomUUID(), name: imported.name, description: imported.description ?? null, cardData: imported.cardData };
    const sources = collectPresentationSources(character);
    report.sources = { revision: sources.sourceRevision, existingIntroduction: Boolean(sources.existingIntroduction),
      candidates: sources.candidates.length, omittedCandidates: sources.omittedCandidates, limited: sources.limited };
    if (mode === 'verify') {
      report.draft = revalidatePresentationDraft(character, previous.draft);
      report.result = report.draft.status;
      report.verified = true;
      return;
    }
    if (mode === 'inspect') {
      report.result = sources.existingIntroduction ? 'author-preserved' : sources.limited ? 'source-limit'
        : sources.candidates.length ? 'candidates-available-no-model-called' : 'no-public-excerpt';
      return;
    }
    const model = settings.CUSTOM_LLM_DEFAULT_MODEL || settings.CUSTOM_LLM_MODELS?.split(',')[0]?.trim();
    const adapter = settings.CUSTOM_LLM_API_FORMAT === 'gemini'
      ? await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url) : null;
    report.draft = await runPresentationGraph({ character, signal: controller.signal,
      checkpoint: async stage => { report.stage = stage; await persist(); },
      select: async (prompt, signal) => {
        await requireEngineeringGateway(settings);
        controller.signal.throwIfAborted();
        const request = { model, messages: [{ role: 'user', content: prompt }], max_tokens: 512, temperature: 0, stream: false };
        report.modelCalls++; await persist();
        const native = adapter?.buildGeminiRequest(settings.CUSTOM_LLM_BASE_URL, settings.CUSTOM_LLM_API_KEY, request);
        const timeout = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
        const response = native ? await fetch(native.url, { ...native.init, redirect: 'error', signal: timeout })
          : await fetch(`${settings.CUSTOM_LLM_BASE_URL}/chat/completions`, { method: 'POST', redirect: 'error', signal: timeout,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.CUSTOM_LLM_API_KEY}` }, body: JSON.stringify(request) });
        if (!response.ok) throw new Error('PRESENTATION_PROVIDER_FAILED');
        const completion = adapter ? await adapter.readGeminiCompletion(response, model) : await response.json();
        const choice = completion.choices?.[0];
        if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || choice.message.content.length > 4096) throw new Error('PRESENTATION_PROVIDER_OUTPUT_INVALID');
        report.usage = completion.usage ?? null;
        const text = choice.message.content.trim();
        const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
        return JSON.parse(fenced ? fenced[1] : text);
      } });
    report.result = report.draft.status;
  } catch (error) {
    report.result = 'failed';
    report.error = controller.signal.aborted ? 'PRESENTATION_CANCELLED'
      : typeof error?.code === 'string' && error.code.startsWith('BUDGET_') ? error.code
        : ['PRESENTATION_SOURCE_STALE', 'PRESENTATION_SELECTION_INVALID', 'PRESENTATION_DRAFT_INVALID', 'PRESENTATION_PROVIDER_FAILED', 'PRESENTATION_PROVIDER_OUTPUT_INVALID'].includes(error?.message)
          ? error.message : 'PRESENTATION_CHECK_FAILED';
    process.exitCode = 1;
  } finally {
    await persist(); await output.close();
    process.off('SIGTERM', stop); process.off('SIGINT', stop);
    console.info(JSON.stringify({ result: report.result, modelCalls: report.modelCalls, productAdopted: false, error: report.error }));
  }
}

main().catch(error => {
  console.error(JSON.stringify({ error: typeof error?.code === 'string' && /^(?:BUDGET_|ENGINEERING_)/.test(error.code)
    ? error.code : 'PRESENTATION_CHECK_STARTUP_FAILED' }));
  process.exitCode = 1;
});
