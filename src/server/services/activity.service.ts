import { activityRepository } from '../../db/repositories/activity.repository';
import { eventBus } from './event-bus.service';
import { logger } from './logger.service';

const activityLogger = logger.child({ module: 'activity' });

export class ActivityService {
  async record(
    userId: string,
    type: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>
  ) {
    try {
      await activityRepository.create({
        userId,
        type,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        metadata: metadata ?? null,
      });
    } catch (error) {
      activityLogger.error('Failed to record activity', error as Error);
    }
  }

  async getFeed(userId: string, limit = 20, offset = 0) {
    return activityRepository.getFeed(userId, limit, offset);
  }

  async getUserActivities(userId: string, limit = 20, offset = 0) {
    return activityRepository.getByUser(userId, limit, offset);
  }

  registerListeners() {
    eventBus.on('social.follow', async (payload) => {
      const { followerId, followingId } = payload as { followerId: string; followingId: string };
      await this.record(followerId, 'follow', 'user', followingId);
    });

    eventBus.on('social.favorite', async (payload) => {
      const { userId, characterId } = payload as { userId: string; characterId: string };
      await this.record(userId, 'favorite', 'character', characterId);
    });

    eventBus.on('social.comment', async (payload) => {
      const { userId, characterId, commentId } = payload as {
        userId: string; characterId: string; commentId: string;
      };
      await this.record(userId, 'comment', 'character', characterId, { commentId });
    });

    eventBus.on('character.created', async (payload) => {
      const { userId, characterId, name } = payload as {
        userId: string; characterId: string; name: string;
      };
      await this.record(userId, 'character_created', 'character', characterId, { name });
    });
  }
}

export const activityService = new ActivityService();
