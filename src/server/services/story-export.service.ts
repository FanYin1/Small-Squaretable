import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { storyBranches, storyReadings } from '../../db/schema/story-corrections';
import { db, type Database } from '../../db';
import { chats, messages } from '../../db/schema/chats';
import { storyWorldbooks } from '../../db/schema/story-worldbooks';
import { AppError, NotFoundError } from '../../core/errors';
import type { StoryReadingExport } from '../../types/story-export';
import { storyIdentitySnapshotSchema } from '../../types/story-identity';
import { storyWorldbooksSnapshotSchema } from '../../types/story-worldbooks';
import { loadStoryContent } from './story-content.service';
import { getStoryEvents, readStoryState } from './story-state.service';
import { storyAudienceSchema } from '../../types/story-knowledge';

export async function exportStoryReading(chatId: string, userId: string, tenantId: string, database: Database = db): Promise<StoryReadingExport> {
  return database.transaction(async transaction => {
    const [chat] = await transaction.select().from(chats).where(and(eq(chats.id, chatId), eq(chats.userId, userId), eq(chats.tenantId, tenantId)));
    if (!chat) throw new NotFoundError('Chat');
    if (chat.contentSnapshotVersion != null && chat.contentSnapshotVersion !== 1) {
      throw new AppError('Unsupported saved content version', 409, 'STORY_CONTENT_VERSION');
    }
    const story = await readStoryState(chat.id, userId, transaction);
    const events: StoryReadingExport['story']['events'] = [];
    let beforeVersion: number | undefined;
    while (true) {
      const page = await getStoryEvents(chat.id, userId, beforeVersion, transaction);
      if (!page.length) break;
      events.push(...page);
      beforeVersion = page[page.length - 1].version;
    }
    const content = chat.contentSnapshotVersion == null ? null : await loadStoryContent(chat.id, userId, transaction);
    let worldbookRevision: string | null = null;
    if (chat.worldbookSnapshotVersion != null) {
      if (chat.worldbookSnapshotVersion !== 1) throw new AppError('Unsupported saved worldbook version', 409, 'STORY_WORLDBOOK_VERSION');
      const [worldbook] = await transaction.select().from(storyWorldbooks).where(eq(storyWorldbooks.chatId, chat.id));
      if (!worldbook) throw new AppError('Saved worldbook content is unavailable', 409, 'STORY_WORLDBOOK_UNAVAILABLE');
      worldbookRevision = storyWorldbooksSnapshotSchema.parse(worldbook.snapshot).revision;
    }
    const identity = chat.identitySnapshot == null ? null : storyIdentitySnapshotSchema.parse(chat.identitySnapshot);
    const history = await transaction.select().from(messages).where(and(eq(messages.chatId, chat.id), inArray(messages.role, ['user', 'assistant']))).orderBy(asc(messages.sentAt), asc(messages.id));
    const [branch] = await transaction.select().from(storyBranches).where(eq(storyBranches.chatId, chatId));
    const readings = await transaction.select().from(storyReadings).where(and(eq(storyReadings.chatId, chatId), isNull(storyReadings.revokedAt))).orderBy(asc(storyReadings.createdAt));
    return {
      format: 'small-squaretable.story-reading', version: 1,
      scope: { purpose: 'player-readable-record', restorable: false, attachments: 'references-only',
        excluded: ['private-card-content', 'worldbook-content', 'hidden-state-and-rules', 'system-messages', 'derived-memory-and-vectors', 'account-and-billing-data'] },
      chat: { id: chat.id, title: chat.title, characterId: chat.characterId, createdAt: chat.createdAt.toISOString(), updatedAt: chat.updatedAt.toISOString() },
      identity: identity ? { protocol: identity.protocol, name: identity.name, description: identity.description, source: identity.source, revision: identity.revision, capturedAt: identity.capturedAt } : null,
      characters: content?.characters.map(character => ({ id: character.id, name: character.name })) ?? [],
      snapshots: { contentVersion: chat.contentSnapshotVersion, worldbookVersion: chat.worldbookSnapshotVersion,
        contentRevision: content?.revision ?? null, worldbookRevision },
      messages: history.map(message => {
        const status = (message.extra as { stateStatus?: unknown } | null)?.stateStatus;
        const audience = storyAudienceSchema.safeParse((message.extra as Record<string, unknown> | null)?.storyAudience);
        return { id: message.id, role: message.role as 'user' | 'assistant', content: message.content,
          characterId: message.characterId, sentAt: message.sentAt.toISOString(), attachments: message.attachments,
          stateStatus: status === 'interrupted' || status === 'confirmed' || status === 'proposed' ? status : null,
          ...(audience.success ? { storyAudience: audience.data } : {}) };
      }),
      story: { ...story, events: events.reverse() },
      branch: branch ?? null,
      readings: readings.map(reading => ({ ...reading, createdAt: reading.createdAt.toISOString() })),
      messageCount: history.length, eventCount: events.length, exportedAt: new Date().toISOString(),
    };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export function renderStoryReading(record: StoryReadingExport, format: 'txt' | 'markdown'): string {
  const markdown = format === 'markdown';
  const escape = (text: string) => markdown ? text.replace(/[\\`*_{}[\]()#+.!|<>~&-]/g, '\\$&').replace(/[\r\n]+/g, ' ') : text;
  const heading = (text: string, level = 2) => `${markdown ? '#'.repeat(level) + ' ' : ''}${escape(text)}\n`;
  const block = (text: string) => {
    if (!markdown) return `${text}\n`;
    const fence = '`'.repeat([...text.matchAll(/`+/g)].reduce((length, match) => Math.max(length, match[0].length + 1), 3));
    return `${fence}text\n${text}\n${fence}\n`;
  };
  const lines = [heading(record.chat.title || '故事记录 / Story record', 1),
    '玩家可读记录 / Player-readable record。仅包含可见内容，不能用于恢复存档。附件仅保留引用，未打包文件。',
    `Exported: ${record.exportedAt} | Messages: ${record.messageCount} | Events: ${record.eventCount}`,
    heading('开局身份 / Identity'), block(record.identity ? `${record.identity.name}\n${record.identity.description ?? ''}` : '未保存冻结身份 / No frozen identity'),
    heading('出场角色 / Characters'), ...record.characters.map(character => block(`${character.name} (${character.id})`)),
    heading('版本依据 / Snapshot references'), block(JSON.stringify(record.snapshots, null, 2)),
    heading('可见状态 / Visible state'), `Version: ${record.story.version}`,
    ...record.story.fields.map(field => block(`${field.label}: ${field.value === null ? '未知 / Unknown' : String(field.value)}${field.unit ? ` ${field.unit}` : ''}\nSource event: ${field.sourceEventId ?? 'initial'}`)),
    heading('已知地图 / Known map'), block(record.story.map ? JSON.stringify(record.story.map, null, 2) : '无已知地图 / No known map'),
    heading('此次笔记 / Story notes'), ...record.story.notes.map(note => block(`[${note.kind}] ${note.content}`)),
    heading('分支出处 / Branch origin'), block(record.branch ? JSON.stringify(record.branch, null, 2) : '原始开始 / Original start'),
    heading('阅读修订（不进入剧情记忆）/ Reading revisions'), ...(record.readings ?? []).map(reading => block(`#${reading.messageId} [${reading.kind}] ${reading.content}`)),
    heading('历程与来源 / Events and sources'), ...record.story.events.map(event => block(`Version ${event.version} | ${event.status} | ${event.createdAt}\nEvent: ${event.id}\nMessages: ${event.inputMessageId ?? '-'} → ${event.messageId ?? '-'}\n${event.actionLabel ?? ''}\n${event.outcome ?? ''}\n${event.excerpt}`)),
    heading('正文 / Messages'), ...record.messages.flatMap(message => {
      const speaker = message.role === 'user' ? record.identity?.name : record.characters.find(character => character.id === message.characterId)?.name
        ?? (record.characters.length === 1 ? record.characters[0].name : undefined);
      return [heading(`${speaker ? `${speaker} (${message.role})` : message.role} | ${message.sentAt} | #${message.id}${message.stateStatus ? ` | ${message.stateStatus}` : ''}`, 3),
        ...(message.storyAudience ? [block(`私下交谈 / Private conversation: ${message.storyAudience.map(id => record.characters.find(character => character.id === id)?.name ?? id).join('、')}`)] : []),
        block(message.content), ...(message.attachments == null ? [] : [block(`Attachments: ${JSON.stringify(message.attachments)}`)])];
    }),
  ];
  return lines.join('\n');
}
