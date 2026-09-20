import { eq } from 'drizzle-orm';
import { db } from '../index';
import { chatOverrides, type ChatOverride, type NewChatOverride } from '../schema';

export class ChatOverrideRepository {
  /**
   * Create or update chat override
   */
  async createOrUpdate(chatId: string, data: Omit<NewChatOverride, 'chatId'>): Promise<ChatOverride> {
    // Check if override already exists
    const existing = await this.findByChatId(chatId);

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(chatOverrides)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(chatOverrides.chatId, chatId))
        .returning();
      return updated;
    } else {
      // Create new
      const [created] = await db
        .insert(chatOverrides)
        .values({ chatId, ...data })
        .returning();
      return created;
    }
  }

  /**
   * Find override by chat ID
   */
  async findByChatId(chatId: string): Promise<ChatOverride | undefined> {
    const [override] = await db
      .select()
      .from(chatOverrides)
      .where(eq(chatOverrides.chatId, chatId));
    return override;
  }

  /**
   * Update override
   */
  async update(
    chatId: string,
    data: Partial<Omit<ChatOverride, 'id' | 'chatId' | 'createdAt'>>
  ): Promise<ChatOverride | undefined> {
    const [updated] = await db
      .update(chatOverrides)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(chatOverrides.chatId, chatId))
      .returning();
    return updated;
  }

  /**
   * Enable override
   */
  async enable(chatId: string): Promise<void> {
    await db
      .update(chatOverrides)
      .set({ enabled: true, updatedAt: new Date() })
      .where(eq(chatOverrides.chatId, chatId));
  }

  /**
   * Disable override
   */
  async disable(chatId: string): Promise<void> {
    await db
      .update(chatOverrides)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(chatOverrides.chatId, chatId));
  }

  /**
   * Delete override
   */
  async delete(chatId: string): Promise<void> {
    await db.delete(chatOverrides).where(eq(chatOverrides.chatId, chatId));
  }
}

export const chatOverrideRepository = new ChatOverrideRepository();
