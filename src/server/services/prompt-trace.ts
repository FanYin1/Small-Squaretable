import { randomUUID } from 'node:crypto';
import type { PromptAssemblyTrace, PromptSize, PromptTrace, PromptTransportTrace } from '../../types/prompt-trace';
import type { ContextBuildResult, LLMMessage } from './context-manager.service';
import type { AtDepthEntry, PromptSection } from './prompt-assembly';
import type { WorldInfoDebugInfo } from './worldinfo-engine.service';
import { CONTEXT_BUFFER_TOKENS, estimateContextMessages, estimateContextTokens, type ContextLimits } from './context-budget';

export const TRACE_DETAIL_LIMIT = 200;
export const promptSize = (content: string): PromptSize => ({ characters: content.length, estimatedTokens: estimateContextTokens(content) });

export function summarizePromptAssembly(input: {
  layout: PromptAssemblyTrace['layout']; sections: PromptSection[]; memoryIds: string[];
  depthEntries: Array<AtDepthEntry & { source: string }>;
  worldInfo?: WorldInfoDebugInfo; worldbookRevision?: string;
}): PromptAssemblyTrace {
  const wi = input.worldInfo;
  return {
    layout: input.layout,
    sections: input.sections.filter(section => section.parts.length).map(section => ({
      source: section.source ?? 'unknown', placement: input.layout === 'cache_friendly' && section.dynamic ? 'dynamic' : 'system',
      ...promptSize(section.parts.join('\n')),
    })),
    depthEntries: input.depthEntries.slice(0, TRACE_DETAIL_LIMIT).map(entry => ({ source: entry.source, depth: entry.depth, role: entry.role, ...promptSize(entry.content) })),
    memoryIds: input.memoryIds.slice(0, TRACE_DETAIL_LIMIT), memoryCount: input.memoryIds.length,
    worldbook: wi ? {
      version: wi.scanEngineVersion, ...(input.worldbookRevision ? { revision: input.worldbookRevision } : {}),
      scanned: wi.scannedEntries, activated: wi.activatedCount, budgetUsed: wi.budgetUsed, budgetLimit: wi.budgetLimit,
      budgetUnit: wi.budgetUnit, scanMessageCount: wi.scanMessageCount, maxRecursionDepth: wi.maxRecursionDepth,
      constantBudgetOverflow: wi.constantBudgetOverflow,
      decisions: wi.decisions.slice(0, TRACE_DETAIL_LIMIT).map(decision => ({
        entryId: decision.entryId, status: decision.status, reason: decision.reason,
        recursionDepth: decision.recursionDepth, tokens: decision.tokens, unsupported: decision.unsupported,
      })),
      omittedDecisions: Math.max(0, wi.decisions.length - TRACE_DETAIL_LIMIT),
    } : null,
  };
}

/** Called on the already selected/injected messages; no scanner, macros or retrieval runs here. */
export function buildPromptTrace(input: {
  requestId?: string; userMessageId: number; model: string; template: string;
  transport: PromptTransportTrace; snapshots: PromptTrace['snapshots'];
  assembly?: PromptAssemblyTrace; history: LLMMessage[]; context: ContextBuildResult;
  injected: Map<object, { depth: number; source: string }>; limits: ContextLimits; depthReservedTokens: number;
  formattedPrompt?: string; sourceProjectionApplied: boolean;
}): PromptTrace {
  const final = input.context.messages;
  const retained = new Set(final);
  const original = new Set(input.history);
  const realHistory = input.history.filter(message => message.messageId !== undefined);
  const retainedHistory = realHistory.filter(message => retained.has(message));
  const omittedHistory = realHistory.filter(message => !retained.has(message));
  return {
    version: 1, id: randomUUID(), requestId: input.requestId ?? null, userMessageId: input.userMessageId,
    capturedAt: new Date().toISOString(), stage: 'upstream_request_prepared',
    model: input.model.slice(0, 160), template: input.template.slice(0, 80), transport: input.transport,
    snapshots: input.snapshots, assembly: input.assembly ?? null,
    budget: {
      contextWindow: input.limits.contextWindow, maxInputTokens: input.limits.maxInputTokens ?? null,
      outputTokens: input.limits.maxOutputTokens, bufferTokens: CONTEXT_BUFFER_TOKENS,
      availableInputTokens: Math.max(0, Math.min(input.limits.contextWindow - input.limits.maxOutputTokens,
        input.limits.maxInputTokens ?? input.limits.contextWindow) - CONTEXT_BUFFER_TOKENS),
      estimatedInputTokens: input.formattedPrompt === undefined ? estimateContextMessages(final) + 2 : estimateContextTokens(input.formattedPrompt),
      depthReservedTokens: input.depthReservedTokens,
    },
    history: {
      supplied: realHistory.length, retained: retainedHistory.length, omitted: omittedHistory.length,
      retainedIds: retainedHistory.slice(-TRACE_DETAIL_LIMIT).map(message => message.messageId!),
      omittedIds: omittedHistory.slice(-TRACE_DETAIL_LIMIT).map(message => message.messageId!),
      summarized: input.context.summarized ?? false, summaryTokens: input.context.summaryTokens ?? 0,
    },
    messages: final.slice(0, TRACE_DETAIL_LIMIT).map((message, index) => {
      const injection = input.injected.get(message);
      return { index, role: message.role, ...promptSize(message.content),
        source: injection ? injection.source : message.messageId !== undefined && original.has(message) ? 'history'
          : index === 0 ? 'assembled_system' : original.has(message) ? 'continuity_note' : 'context_auxiliary',
        ...(message.messageId !== undefined ? { messageId: message.messageId } : {}),
        ...(injection ? { depth: injection.depth } : {}),
      };
    }),
    messageCount: final.length, omittedMessageDetails: Math.max(0, final.length - TRACE_DETAIL_LIMIT),
    sourceProjectionApplied: input.sourceProjectionApplied,
  };
}
