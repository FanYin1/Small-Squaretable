/** Metadata only: never persist prompt text, matching keywords, credentials or URLs. */
export interface PromptSize { characters: number; estimatedTokens: number }
export interface PromptAssemblyTrace {
  layout: 'legacy' | 'cache_friendly';
  sections: Array<PromptSize & { source: string; placement: 'system' | 'dynamic' }>;
  depthEntries: Array<PromptSize & { source: string; depth: number; role: string }>;
  memoryIds: string[];
  memoryCount: number;
  worldbook: null | {
    version: 1 | 2;
    revision?: string;
    scanned: number;
    activated: number;
    budgetUsed: number;
    budgetLimit: number;
    budgetUnit: 'characters' | 'estimated_tokens';
    scanMessageCount: number;
    maxRecursionDepth: number;
    constantBudgetOverflow: boolean;
    decisions: Array<{ entryId: string; status: 'injected' | 'excluded'; reason: string; recursionDepth?: number; tokens?: number; unsupported?: string[] }>;
    omittedDecisions: number;
  };
}
export interface PromptTransportTrace {
  outputTokens: number;
  adapter: 'openai_chat' | 'text_completion' | 'anthropic' | 'gemini' | 'ollama';
  bodyBytes: number;
  bodySha256: string;
}
export interface PromptTrace {
  version: 1;
  id: string;
  requestId: string | null;
  userMessageId: number;
  capturedAt: string;
  stage: 'upstream_request_prepared';
  model: string;
  template: string;
  transport: PromptTransportTrace;
  snapshots: { content: number | null; worldbook: number | null; identityRevision: string | null };
  assembly: PromptAssemblyTrace | null;
  budget: {
    contextWindow: number;
    maxInputTokens: number | null;
    outputTokens: number;
    bufferTokens: number;
    availableInputTokens: number;
    estimatedInputTokens: number;
    depthReservedTokens: number;
  };
  history: { supplied: number; retained: number; omitted: number; retainedIds: number[]; omittedIds: number[]; summarized: boolean; summaryTokens: number };
  messages: Array<PromptSize & { index: number; role: string; source: string; messageId?: number; depth?: number }>;
  messageCount: number;
  omittedMessageDetails: number;
  sourceProjectionApplied: boolean;
}
export interface PromptTraceList { traces: PromptTrace[]; retentionHours: number; limit: number }
