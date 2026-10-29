import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../index';
import { generationRequests } from '../schema/generation-requests';
import { BaseRepository } from './base.repository';
import { chats } from '../schema/chats';

export class GenerationRequestRepository extends BaseRepository {
  async findByRequest(chatId: string, requestId: string) {
    const [request] = await this.db.select().from(generationRequests).where(and(
      eq(generationRequests.chatId, chatId),
      eq(generationRequests.requestId, requestId)
    )).limit(1);
    return request ?? null;
  }

  async claim(chatId: string, requestId: string, payloadHash: string) {
    return this.db.transaction(async transaction => {
      const [chat] = await transaction.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId)).for('update');
      if (!chat) throw new Error('Story no longer exists');
      const [request] = await transaction.insert(generationRequests).values({ chatId, requestId, payloadHash, createdAt: sql`clock_timestamp()` })
        .onConflictDoNothing({ target: [generationRequests.chatId, generationRequests.requestId] })
        .returning();
      if (request) return { claimed: true as const, request };
      const [existing] = await transaction.select().from(generationRequests).where(and(eq(generationRequests.chatId, chatId), eq(generationRequests.requestId, requestId)));
      if (!existing) throw new Error('Generation request could not be confirmed');
      return { claimed: false as const, request: existing };
    });
  }

  async markRunning(id: string, userMessageId: number): Promise<void> {
    const [request] = await this.db.update(generationRequests)
      .set({ status: 'running', userMessageId, updatedAt: new Date() })
      .where(and(eq(generationRequests.id, id), eq(generationRequests.status, 'accepted')))
      .returning({ id: generationRequests.id });
    if (!request) throw new Error('Generation request is no longer accepted');
  }

  async finish(id: string, status: 'completed' | 'stopped' | 'failed', errorCode?: string): Promise<void> {
    const finishedAt = new Date();
    await this.db.update(generationRequests)
      .set({ status, errorCode: errorCode ?? null, updatedAt: finishedAt, finishedAt })
      .where(and(
        eq(generationRequests.id, id),
        inArray(generationRequests.status, ['accepted', 'running'])
      ));
  }
}

export const generationRequestRepository = new GenerationRequestRepository(db);
