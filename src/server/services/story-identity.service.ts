import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db';
import { users } from '../../db/schema/users';
import { userPersonas } from '../../db/schema/user-personas';
import { NotFoundError } from '../../core/errors';
import { storyIdentitySnapshotSchema, type StoryIdentitySnapshot } from '../../types/story-identity';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function captureStoryIdentity(
  transaction: Transaction,
  userId: string,
  tenantId: string,
  personaId?: string,
): Promise<StoryIdentitySnapshot> {
  const [account] = await transaction.select({ name: users.displayName }).from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  if (!account) throw new NotFoundError('User');
  let name = account.name || 'User';
  let description: string | null = null;
  if (personaId) {
    const [persona] = await transaction.select({ name: userPersonas.name, description: userPersonas.description })
      .from(userPersonas).where(and(
        eq(userPersonas.id, personaId), eq(userPersonas.userId, userId), eq(userPersonas.tenantId, tenantId),
      ));
    if (!persona) throw new NotFoundError('Persona');
    name = persona.name;
    description = persona.description;
  }
  const content = { protocol: 1 as const, userId, tenantId, source: personaId ? 'persona' as const : 'account' as const,
    sourceId: personaId ?? userId, name, description };
  return storyIdentitySnapshotSchema.parse({ ...content,
    revision: createHash('sha256').update(JSON.stringify(content)).digest('hex'), capturedAt: new Date().toISOString(),
  });
}
