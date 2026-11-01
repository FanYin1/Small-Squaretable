import { sql } from 'drizzle-orm';
import { config } from '../../core/config';
import type { DbTransaction } from '../../db/repositories/base.repository';

/** Applied inside the signup transaction, after account creation and before commit. */
export async function grantRegistrationCredits(account: { id: string; tenantId: string }, tx: DbTransaction) {
  if (!config.newAccountUnlimitedCredits) return;
  const rows = await tx.execute(sql`
    WITH granted AS (
      UPDATE tenants SET settings = settings || jsonb_build_object('creditUnlimitedUserId', ${account.id}::text),
        updated_at = now()
      WHERE id = ${account.tenantId}
        AND EXISTS (SELECT 1 FROM users WHERE id = ${account.id} AND tenant_id = ${account.tenantId})
        AND NOT EXISTS (SELECT 1 FROM users WHERE tenant_id = ${account.tenantId} AND id <> ${account.id})
      RETURNING id
    )
    INSERT INTO audit_logs (tenant_id, actor_id, action, target_type, target_id, metadata)
    SELECT id, 'system', 'credit_exemption', 'user', ${account.id},
      jsonb_build_object('operation', 'grant', 'source', 'registration-policy')
    FROM granted RETURNING id
  `);
  if (rows.length !== 1) throw new Error('Unable to apply single-account registration credit policy');
}
