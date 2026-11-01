/** Public/admin capacities. requestOutputTokens is a policy, not a model capability. */
export interface ModelLimitsInput {
  contextWindow: number;
  maxInputTokens?: number;
  maxOutputTokens: number;
  requestOutputTokens: number;
}

/** Shared by the editor and server so JSON and numeric edits have identical rules. */
export function validateModelLimits(raw: unknown, models: string[]): Record<string, ModelLimitsInput> {
  const fail = (message: string): never => { throw new Error(`CUSTOM_LLM_MODEL_LIMITS: ${message}`); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('expected an object keyed by configured model names');
  const result: Record<string, ModelLimitsInput> = Object.create(null);
  for (const [key, value] of Object.entries(raw as object)) {
    const model = key.trim();
    if (!models.includes(model)) fail(`model "${model}" is not in the model list`);
    if (Object.hasOwn(result, model)) fail(`duplicate model "${model}" after trimming spaces`);
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`"${model}" needs a capacity object`);
    const entry = value as Record<string, unknown>;
    for (const field of Object.keys(entry)) {
      if (!['contextWindow', 'maxInputTokens', 'maxOutputTokens', 'requestOutputTokens'].includes(field)) fail(`"${model}" has an unknown capacity field`);
    }
    for (const field of ['contextWindow', 'maxOutputTokens', 'requestOutputTokens', ...(entry.maxInputTokens === undefined ? [] : ['maxInputTokens'])]) {
      const tokens = entry[field];
      if (typeof tokens !== 'number' || !Number.isSafeInteger(tokens) || tokens <= 0) fail(`"${model}" ${field} must be a positive safe integer (tokens)`);
    }
    const limits = entry as unknown as ModelLimitsInput;
    if (limits.maxOutputTokens >= limits.contextWindow) fail(`"${model}" maxOutputTokens must be less than contextWindow`);
    if (limits.maxInputTokens !== undefined && limits.maxInputTokens > limits.contextWindow) fail(`"${model}" maxInputTokens must not exceed contextWindow`);
    if (limits.requestOutputTokens > limits.maxOutputTokens) fail(`"${model}" requestOutputTokens must not exceed maxOutputTokens`);
    if (limits.requestOutputTokens + 100 >= limits.contextWindow) fail(`"${model}" contextWindow must leave room for input and a 100-token buffer`);
    result[model] = { ...limits };
  }
  return result;
}
