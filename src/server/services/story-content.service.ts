import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { chats, type Chat } from '../../db/schema/chats';
import { storyContent } from '../../db/schema/story-content';
import { characterRepository } from '../../db/repositories/character.repository';
import { AppError, NotFoundError } from '../../core/errors';
import { storyCharacterSchema, storyContentSnapshotSchema } from '../../types/story-content';
import type { StorySources } from './story-diagnostics.service';
import { inspectStoryDiagnostics } from '../../types/story-diagnostics';

export function captureStoryContent(characterIds: string[], userId: string, sources: StorySources) {
  const rows = sources.characters;
  const captured = characterIds.map(characterId => {
    const row = rows.find(item => item.id === characterId);
    if (!row || (row.creatorId !== userId && !(row.isPublic && row.moderationStatus === 'approved'))) {
      throw new NotFoundError('Character');
    }
    return storyCharacterSchema.parse(row);
  });
  const books = sources.books;
  captured.forEach(character => { character.diagnostics = inspectStoryDiagnostics(character.cardData, character.id, books, captured.length > 1); });
  return storyContentSnapshotSchema.parse({ protocol: 1, characters: captured,
    revision: createHash('sha256').update(JSON.stringify(captured)).digest('hex'), capturedAt: new Date().toISOString(),
  });
}

export async function loadStoryContent(chatId: string, userId: string, database: Pick<Database, 'select'> = db) {
  const [row] = await database.select({ snapshot: storyContent.snapshot }).from(storyContent)
    .innerJoin(chats, eq(chats.id, storyContent.chatId))
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId), eq(chats.contentSnapshotVersion, 1)));
  if (!row) throw new AppError('Saved character content is unavailable', 409, 'STORY_CONTENT_UNAVAILABLE');
  return storyContentSnapshotSchema.parse(row.snapshot);
}

export async function resolveStoryCharacter(chat: Pick<Chat, 'id' | 'userId' | 'contentSnapshotVersion'>, characterId?: string | null) {
  if (chat.contentSnapshotVersion == null) return characterId ? characterRepository.findById(characterId) : null;
  if (chat.contentSnapshotVersion !== 1) throw new AppError('Unsupported saved content version', 409, 'STORY_CONTENT_VERSION');
  const snapshot = await loadStoryContent(chat.id, chat.userId);
  const character = characterId ? snapshot.characters.find(item => item.id === characterId) : snapshot.characters[0];
  if (characterId && !character) throw new AppError('Character is not part of this story', 409, 'STORY_CHARACTER_UNBOUND');
  return character ?? null;
}
