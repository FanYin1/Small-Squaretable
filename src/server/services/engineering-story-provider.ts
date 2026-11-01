import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { LLMProviderConfig } from '../../types/llm';
import { AppError } from '../../core/errors';

// Administrator-only, temporary routing for one acceptance story. Never accepted
// from HTTP/WS input, and never changes the default provider for other stories.
const routeSchema = z.object({
  chatId: z.string().uuid(), userId: z.string().uuid(), tenantId: z.string().min(1),
  model: z.string().min(1), baseUrl: z.string().url(), apiKey: z.string().min(24),
  expiresAt: z.string().datetime(),
}).strict();
type Route = z.infer<typeof routeSchema>;
type Owner = { userId: string; tenantId: string };

export function parseEngineeringStoryRoute(raw: unknown): Route {
  const route = routeSchema.parse(raw);
  const url = new URL(route.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid engineering gateway URL');
  }
  return route;
}

export function createEngineeringStoryResolver(route: Route | null,
  findOwner: (id: string) => Promise<Owner | null>, now = Date.now) {
  return async (provider: LLMProviderConfig, model: string, chatId?: string): Promise<LLMProviderConfig> => {
    if (!route || chatId !== route.chatId) return provider;
    // Expiry, wrong model, missing owner and gateway failures must not fall back
    // to an unbudgeted upstream call.
    if (now() >= Date.parse(route.expiresAt) || model !== route.model) {
      throw new AppError('Engineering story route is unavailable', 503, 'ENGINEERING_ROUTE_UNAVAILABLE');
    }
    const owner = await findOwner(chatId);
    if (!owner || owner.userId !== route.userId || owner.tenantId !== route.tenantId) {
      throw new AppError('Engineering story scope mismatch', 503, 'ENGINEERING_ROUTE_SCOPE');
    }
    return { ...provider, baseUrl: route.baseUrl, apiKey: route.apiKey };
  };
}

const route = process.env.ENGINEERING_STORY_ROUTE_FILE
  ? parseEngineeringStoryRoute(JSON.parse(readFileSync(process.env.ENGINEERING_STORY_ROUTE_FILE, 'utf8'))) : null;
export const resolveEngineeringStoryProvider = createEngineeringStoryResolver(route, async id => {
  const { chatRepository } = await import('../../db/repositories/chat.repository');
  return chatRepository.findById(id);
});
