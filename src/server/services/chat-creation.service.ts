import { createHash } from 'node:crypto';
import { sourcedStoryRecommendations } from '../../types/story-recommendations';
import { and, eq } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { chats, messages } from '../../db/schema/chats';
import { chatCharacters } from '../../db/schema/chat-characters';
import { chatCreationRequests } from '../../db/schema/chat-creation-requests';
import { AppError } from '../../core/errors';
import { captureStoryIdentity } from './story-identity.service';
import { captureStoryWorldbooks } from './story-worldbooks.service';
import { storyWorldbooks } from '../../db/schema/story-worldbooks';
import { captureStoryContent } from './story-content.service';
import { storyContent } from '../../db/schema/story-content';
import { initializeStoryState } from './story-state.service';
import type { ChatCreationStatus, CreateChatInput } from '../../types/chat';
import { validateStoryIdentities } from '../../types/story-diagnostics';
import { collectStorySources } from './story-diagnostics.service';
import { selectStoryOpening } from './story-entry.service';
import { applyMacros } from './macro.service';
import { attachStoryAdaptation } from './story-adapter-jobs.service';
import { attachStoryPresentations } from './character-presentation.service';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export class ChatCreationService {
  constructor(private database: Database = db) {}

  async lookup(userId: string, tenantId: string, requestId: string): Promise<ChatCreationStatus> {
    const [request] = await this.database.select({ chatId: chats.id })
      .from(chatCreationRequests)
      .leftJoin(chats, and(
        eq(chats.id, chatCreationRequests.chatId), eq(chats.tenantId, tenantId), eq(chats.userId, userId),
      ))
      .where(and(
        eq(chatCreationRequests.tenantId, tenantId), eq(chatCreationRequests.userId, userId),
        eq(chatCreationRequests.requestId, requestId),
      ));
    if (!request) return { protocol: 1, status: 'not_found' };
    return request.chatId
      ? { protocol: 1, status: 'created', chatId: request.chatId }
      : { protocol: 1, status: 'deleted' };
  }

  async create(userId: string, tenantId: string, input: CreateChatInput & { clientRequestId: string }, beforeOpening?: () => Promise<void>) {
    const characterIds = [...new Set(input.characterIds ?? (input.characterId ? [input.characterId] : []))];
    const payload = {
      characterIds,
      personaId: input.personaId ?? null,
      title: input.title ?? null,
      metadata: input.metadata ?? {},
      ...(input.opening ? { opening: input.opening } : {}),
    };
    const payloadHash = createHash('sha256').update(canonicalJson(payload)).digest('hex');

    return this.database.transaction(async transaction => {
      const [claim] = await transaction.insert(chatCreationRequests)
        .values({ tenantId, userId, requestId: input.clientRequestId, payloadHash })
        .onConflictDoNothing({ target: [chatCreationRequests.tenantId, chatCreationRequests.userId, chatCreationRequests.requestId] })
        .returning();

      if (!claim) {
        const [existing] = await transaction.select().from(chatCreationRequests).where(and(
          eq(chatCreationRequests.tenantId, tenantId),
          eq(chatCreationRequests.userId, userId),
          eq(chatCreationRequests.requestId, input.clientRequestId),
        ));
        if (!existing) throw new AppError('Story creation could not be confirmed', 503, 'CREATION_UNCONFIRMED');
        if (existing.payloadHash !== payloadHash) {
          throw new AppError('This creation request was already used with different input', 409, 'IDEMPOTENCY_CONFLICT');
        }
        if (!existing.chatId) throw new AppError('The story created by this request was deleted', 410, 'CREATED_CHAT_DELETED');
        const [chat] = await transaction.select().from(chats).where(and(
          eq(chats.id, existing.chatId), eq(chats.tenantId, tenantId), eq(chats.userId, userId),
        ));
        if (!chat) throw new AppError('The story created by this request is unavailable', 410, 'CREATED_CHAT_DELETED');
        return { chat, created: false };
      }

      const identitySnapshot = await captureStoryIdentity(transaction, userId, tenantId, input.personaId);
      const sources = await collectStorySources(transaction, characterIds);
      const diagnosticBooks = sources.books;
      const contentSnapshot = captureStoryContent(characterIds, userId, sources);
      await attachStoryAdaptation(transaction, contentSnapshot, sources);
      await attachStoryPresentations(transaction, contentSnapshot, sources);
      const opening = input.opening ? selectStoryOpening(contentSnapshot, sources, input.opening) : null;
      if (opening !== null) await beforeOpening?.();
      const identityIssue = validateStoryIdentities(contentSnapshot.characters, identitySnapshot.name);
      if (identityIssue) throw new AppError(identityIssue === 'invalid'
        ? '作者的身份声明无效，请作者修正后再开始。'
        : '所选称呼与作者固定身份不符，请选择符合要求的人设；多人物卡的固定称呼也须一致。',
      409, identityIssue === 'invalid' ? 'STORY_IDENTITY_INVALID' : 'STORY_IDENTITY_CONFLICT');
      const worldbookSnapshot = await captureStoryWorldbooks(transaction, characterIds, diagnosticBooks);
      const [chat] = await transaction.insert(chats).values({
        tenantId, userId, characterId: characterIds[0], personaId: input.personaId,
        title: input.title, metadata: input.metadata, identitySnapshot, worldbookSnapshotVersion: 1, contentSnapshotVersion: 1,
      }).returning();
      await transaction.insert(storyWorldbooks).values({ chatId: chat.id, snapshot: worldbookSnapshot });
      await transaction.insert(storyContent).values({ chatId: chat.id, snapshot: contentSnapshot });
      await initializeStoryState(transaction, chat.id, contentSnapshot);
      if (opening !== null) {
        const character = contentSnapshot.characters[0];
        const card = character.cardData;
        const content = applyMacros(opening, {
          charName: character.name, userName: identitySnapshot.name,
          personality: typeof card.personality === 'string' ? card.personality : '',
          scenario: typeof card.scenario === 'string' ? card.scenario : '',
          description: character.description ?? '', mesExamples: typeof card.mes_example === 'string' ? card.mes_example : '',
        });
        await transaction.insert(messages).values({ chatId: chat.id, role: 'assistant', content,
          ...(characterIds.length === 1 ? { extra: sourcedStoryRecommendations(content) } : {}) });
      }
      if (characterIds.length > 0) {
        await transaction.insert(chatCharacters).values(characterIds.map((characterId, sortOrder) => ({
          chatId: chat.id, characterId, sortOrder,
        })));
      }
      await transaction.update(chatCreationRequests).set({ chatId: chat.id }).where(eq(chatCreationRequests.id, claim.id));
      return { chat, created: true };
    });
  }
}

export const chatCreationService = new ChatCreationService();
