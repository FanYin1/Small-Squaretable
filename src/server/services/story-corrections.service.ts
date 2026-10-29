import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { chats, messages } from '../../db/schema/chats';
import { chatCharacters } from '../../db/schema/chat-characters';
import { chatCreationRequests } from '../../db/schema/chat-creation-requests';
import { generationRequests } from '../../db/schema/generation-requests';
import { storyStates, storyEvents, storyNotes } from '../../db/schema/story-state';
import { storyContent } from '../../db/schema/story-content';
import { storyWorldbooks } from '../../db/schema/story-worldbooks';
import { storyBranches, storyReadings } from '../../db/schema/story-corrections';
import { storyContentSnapshotSchema } from '../../types/story-content';
import { storyWorldbooksSnapshotSchema } from '../../types/story-worldbooks';
import { storyIdentitySnapshotSchema } from '../../types/story-identity';
import { matchesStoryConditions } from '../../types/story-state';
import { branchInputSchema, readingInputSchema, safeReadingLayout, type StoryBranchInput, type StoryBranchPreview, type StoryReadingInput } from '../../types/story-corrections';
import { AppError, NotFoundError } from '../../core/errors';
import { reconstructStoryPrefix } from './story-prefix';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conflict = (message: string, code = 'STORY_CORRECTION_STALE') => new AppError(message, 409, code);

async function owned(transaction: Transaction, chatId: string, userId: string, tenantId: string) {
  const [chat] = await transaction.select().from(chats).where(and(eq(chats.id, chatId), eq(chats.userId, userId), eq(chats.tenantId, tenantId)));
  if (!chat) throw new NotFoundError('Chat');
  return chat;
}

async function idle(transaction: Transaction, chatId: string) {
  const active = await transaction.select({ id: generationRequests.id }).from(generationRequests)
    .where(and(eq(generationRequests.chatId, chatId), inArray(generationRequests.status, ['accepted', 'running']))).limit(1);
  if (active.length) throw conflict('当前轮次尚未结束，请等待保存完成后再纠正。', 'STORY_GENERATION_ACTIVE');
}

async function prepare(transaction: Transaction, chatId: string, userId: string, tenantId: string, input: StoryBranchInput) {
  const chat = await owned(transaction, chatId, userId, tenantId);
  if (chat.contentSnapshotVersion !== 1 || chat.worldbookSnapshotVersion !== 1 || !chat.identitySnapshot) {
    throw conflict('此旧存档没有完整冻结来源，暂不支持可靠分支。', 'STORY_PREFIX_UNAVAILABLE');
  }
  await idle(transaction, chatId);
  const [content] = await transaction.select().from(storyContent).where(eq(storyContent.chatId, chatId));
  const [books] = await transaction.select().from(storyWorldbooks).where(eq(storyWorldbooks.chatId, chatId));
  const [state] = await transaction.select().from(storyStates).where(eq(storyStates.chatId, chatId));
  if (!content || !books || !state) throw conflict('冻结来源或状态不完整。', 'STORY_PREFIX_UNAVAILABLE');
  storyIdentitySnapshotSchema.parse(chat.identitySnapshot);
  storyWorldbooksSnapshotSchema.parse(books.snapshot);
  const frozen = storyContentSnapshotSchema.parse(content.snapshot);
  const history = await transaction.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.id)).limit(5001);
  const events = await transaction.select().from(storyEvents).where(eq(storyEvents.chatId, chatId)).orderBy(asc(storyEvents.version)).limit(2001);
  const prefix = reconstructStoryPrefix(frozen, history, events, state, input.throughVersion);
  if (frozen.characters.length > 1 && prefix.events.length) {
    const last = prefix.events.at(-1)!;
    const [request] = await transaction.select().from(generationRequests).where(and(eq(generationRequests.chatId, chatId), eq(generationRequests.userMessageId, last.inputMessageId!)));
    if (request?.status !== 'completed') throw conflict('多人轮次缺少完整完成凭据，暂不能作为分叉基点。', 'STORY_PREFIX_UNAVAILABLE');
  }
  const evidence = [...new Set(input.evidenceIds)].map(id => {
    const message = history.find(item => item.id === id && ['user', 'assistant'].includes(item.role));
    if (!message) throw new NotFoundError('Visible source');
    return { id, content: message.content };
  });
  const preview: StoryBranchPreview = {
    digest: digest({ input, content: content.snapshot, books: books.snapshot, identity: chat.identitySnapshot, state, history, events }),
    throughVersion: input.throughVersion, latestVersion: state.version, retainedMessages: prefix.history.length,
    discardedMessages: history.length - prefix.history.length, discardedEvents: events.length - prefix.events.length,
    fields: (prefix.rules?.fields ?? []).filter(field => field.visible && matchesStoryConditions(field.visibleWhen, prefix.values))
      .map(field => ({ label: field.label, value: prefix.values[field.id], unit: field.unit })), evidence,
  };
  return { chat, content, books, prefix, preview };
}

export class StoryCorrectionsService {
  constructor(private readonly database: Database = db) {}

  preview(chatId: string, userId: string, tenantId: string, raw: StoryBranchInput) {
    const input = branchInputSchema.parse(raw);
    return this.database.transaction(async transaction => (await prepare(transaction, chatId, userId, tenantId, input)).preview,
      { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  async fork(chatId: string, userId: string, tenantId: string, raw: StoryBranchInput, previewDigest: string) {
    const input = branchInputSchema.parse(raw);
    const payloadHash = digest({ operation: 'independent-story-branch-v1', chatId, input, previewDigest });
    return this.database.transaction(async transaction => {
      const [claim] = await transaction.insert(chatCreationRequests).values({ tenantId, userId, requestId: input.requestId, payloadHash })
        .onConflictDoNothing({ target: [chatCreationRequests.tenantId, chatCreationRequests.userId, chatCreationRequests.requestId] }).returning();
      if (!claim) {
        const [existing] = await transaction.select().from(chatCreationRequests).where(and(eq(chatCreationRequests.userId, userId),
          eq(chatCreationRequests.tenantId, tenantId), eq(chatCreationRequests.requestId, input.requestId)));
        if (existing?.payloadHash !== payloadHash) throw conflict('此请求已用于其他输入。', 'IDEMPOTENCY_CONFLICT');
        if (!existing.chatId) throw new AppError('该请求创建的分支已删除。', 410, 'CREATED_CHAT_DELETED');
        return { chat: await owned(transaction, existing.chatId, userId, tenantId), created: false };
      }
      await transaction.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId)).for('update');
      const { chat, content, books, prefix, preview } = await prepare(transaction, chatId, userId, tenantId, input);
      if (preview.digest !== previewDigest) throw conflict('原存档或依据已变化，请重新预览后确认。');
      const [parentBranch] = await transaction.select().from(storyBranches).where(eq(storyBranches.chatId, chatId));
      const metadata = chat.metadata as Record<string, unknown> | null;
      const preferences = Object.fromEntries(Object.entries(metadata ?? {}).filter(([key, value]) =>
        (key === 'model' && typeof value === 'string') ||
        (key === 'groupStrategy' && ['round_robin', 'all', 'random'].includes(String(value)))));
      const [branch] = await transaction.insert(chats).values({ tenantId, userId, characterId: chat.characterId, personaId: chat.personaId,
        title: `${chat.title || '故事'} · 分支`.slice(0, 500), metadata: preferences, identitySnapshot: chat.identitySnapshot,
        contentSnapshotVersion: 1, worldbookSnapshotVersion: 1 }).returning();
      await transaction.insert(storyBranches).values({ chatId: branch.id, rootId: parentBranch?.rootId ?? chatId, parentId: chatId,
        throughVersion: input.throughVersion, mode: input.mode, direction: input.direction, evidenceIds: input.evidenceIds });
      await transaction.insert(storyContent).values({ chatId: branch.id, snapshot: content.snapshot });
      await transaction.insert(storyWorldbooks).values({ chatId: branch.id, snapshot: books.snapshot });
      const members = await transaction.select().from(chatCharacters).where(eq(chatCharacters.chatId, chatId));
      if (members.length) await transaction.insert(chatCharacters).values(members.map(member => ({ chatId: branch.id, characterId: member.characterId, sortOrder: member.sortOrder })));
      const messageIds = new Map<number, number>();
      for (const original of prefix.history) {
        const extra = original.extra as Record<string, unknown> | null;
        const retainedExtra = extra ? Object.fromEntries(Object.entries(extra).filter(([key]) => [
          'storyRequestId', 'storyVersion', 'stateStatus', 'storyAudience', 'storyIntent', 'storyIntentInvalid', 'storyConfirmedIntent', 'storyFacts',
          'storyRecommendations', 'storyRecommendationsSource',
        ].includes(key))) : null;
        const [copy] = await transaction.insert(messages).values({ chatId: branch.id, role: original.role, content: original.content,
          attachments: original.attachments, extra: retainedExtra, characterId: original.characterId, sentAt: original.sentAt }).returning();
        messageIds.set(original.id, copy.id);
      }
      const eventIds = new Map<string, string>();
      if (messageIds.size) {
        const receipts = await transaction.select().from(generationRequests).where(and(eq(generationRequests.chatId, chatId),
          inArray(generationRequests.userMessageId, [...messageIds.keys()]), inArray(generationRequests.status, ['completed', 'stopped', 'failed'])));
        if (receipts.length) await transaction.insert(generationRequests).values(receipts.map(receipt => ({ ...receipt, id: randomUUID(),
          chatId: branch.id, userMessageId: messageIds.get(receipt.userMessageId!)! })));
      }
      for (const original of prefix.events) {
        const id = randomUUID(); eventIds.set(original.id, id);
        await transaction.insert(storyEvents).values({ ...original, id, chatId: branch.id,
          inputMessageId: messageIds.get(original.inputMessageId!)!, messageId: messageIds.get(original.messageId!)! });
      }
      await transaction.insert(storyStates).values({ chatId: branch.id, version: input.throughVersion, values: prefix.values,
        completedActions: prefix.completedActions, sources: Object.fromEntries(Object.entries(prefix.sources).map(([field, id]) => [field, eventIds.get(id)!])) });
      await transaction.insert(storyNotes).values({ chatId: branch.id, kind: 'note', content:
        `[本分支用户指定方向 / ${input.mode}，不是已执行事件或数值补丁；引用未经平台自动查证。遵守冻结规则、角色知情与后续实际行动。]\n${input.direction}` });
      await transaction.update(chatCreationRequests).set({ chatId: branch.id }).where(eq(chatCreationRequests.id, claim.id));
      return { chat: branch, created: true };
    });
  }

  readings(chatId: string, userId: string, tenantId: string) {
    return this.database.transaction(async transaction => {
      await owned(transaction, chatId, userId, tenantId);
      return transaction.select().from(storyReadings).where(and(eq(storyReadings.chatId, chatId), isNull(storyReadings.revokedAt))).orderBy(asc(storyReadings.createdAt), asc(storyReadings.id));
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  saveReading(chatId: string, userId: string, tenantId: string, raw: StoryReadingInput) {
    const input = readingInputSchema.parse(raw);
    return this.database.transaction(async transaction => {
      await transaction.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId)).for('update');
      await owned(transaction, chatId, userId, tenantId);
      const [message] = await transaction.select().from(messages).where(and(eq(messages.chatId, chatId), eq(messages.id, input.messageId)));
      if (!message || message.role === 'system') throw new NotFoundError('Visible message');
      const [existing] = await transaction.select().from(storyReadings).where(and(eq(storyReadings.chatId, chatId), eq(storyReadings.requestId, input.requestId)));
      if (existing) {
        if (existing.messageId !== input.messageId || existing.kind !== input.kind || existing.content !== input.content) throw conflict('此请求已用于其他修订。', 'IDEMPOTENCY_CONFLICT');
        if (existing.revokedAt) throw new AppError('此修订已撤销，请使用新操作。', 410, 'READING_REVOKED');
        return existing;
      }
      if (input.kind === 'annotation' && input.content.length > 2000) throw new AppError('阅读标注最多2000字。', 400, 'READING_TOO_LONG');
      const count = await transaction.select({ count: sql<number>`count(*)::int` }).from(storyReadings).where(eq(storyReadings.chatId, chatId));
      if (count[0].count >= 500) throw conflict('此档已达到500次修订记录上限；撤销仍保留历史凭据，不释放次数。');
      if (input.kind === 'layout') {
        await idle(transaction, chatId);
        const [latest] = await transaction.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(desc(messages.id)).limit(1);
        const laterRequests = await transaction.select({ id: generationRequests.id }).from(generationRequests)
          .where(and(eq(generationRequests.chatId, chatId), gte(generationRequests.createdAt, message.sentAt))).limit(1);
        if (latest?.id !== message.id || message.role !== 'assistant' || laterRequests.length) throw conflict('已开始后续轮次，不能采用旧回复的表达候选。');
        if (!safeReadingLayout(message.content, input.content)) throw conflict('只能调整原有段落间距；增删文字或不确定的表达请建立纠正分支。', 'STORY_REWRITE_UNSAFE');
      }
      const [reading] = await transaction.insert(storyReadings).values({ chatId, ...input, createdAt: sql`clock_timestamp()` }).returning();
      return reading;
    });
  }

  removeReading(chatId: string, userId: string, tenantId: string, id: string) {
    return this.database.transaction(async transaction => {
      await owned(transaction, chatId, userId, tenantId);
      await transaction.update(storyReadings).set({ revokedAt: new Date() }).where(and(eq(storyReadings.chatId, chatId), eq(storyReadings.id, id), isNull(storyReadings.revokedAt)));
    });
  }

  family(chatId: string, userId: string, tenantId: string) {
    return this.database.transaction(async transaction => {
      await owned(transaction, chatId, userId, tenantId);
      const [branch] = await transaction.select().from(storyBranches).where(eq(storyBranches.chatId, chatId));
      const root = branch?.rootId ?? chatId;
      return transaction.select({ id: chats.id, title: chats.title, branch: storyBranches }).from(chats)
        .leftJoin(storyBranches, eq(storyBranches.chatId, chats.id)).where(and(eq(chats.userId, userId), eq(chats.tenantId, tenantId),
          sql`(${chats.id} = ${root} OR ${storyBranches.rootId} = ${root})`)).orderBy(asc(chats.createdAt), asc(chats.id));
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }
}

export const storyCorrectionsService = new StoryCorrectionsService();
