import { beforeEach, describe, expect, it, vi } from 'vitest';
const policy = vi.hoisted(() => ({ newAccountUnlimitedCredits: false }));
vi.mock('../../core/config', () => ({ config: policy }));
import { grantRegistrationCredits } from './registration-credit.service';
import type { DbTransaction } from '../../db/repositories/base.repository';

describe('registration credit policy', () => {
  const execute = vi.fn();
  const tx = { execute } as unknown as DbTransaction;
  beforeEach(() => { vi.clearAllMocks(); policy.newAccountUnlimitedCredits = false; });
  it('leaves permissions unchanged when the policy is disabled', async () => {
    await grantRegistrationCredits({ id: 'u', tenantId: 't' }, tx);
    expect(execute).not.toHaveBeenCalled();
  });
  it('grants and audits inside the caller transaction', async () => {
    policy.newAccountUnlimitedCredits = true;
    execute.mockResolvedValue([{ id: 'audit' }]);
    await expect(grantRegistrationCredits({ id: 'u', tenantId: 't' }, tx)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('fails signup if a shared or missing account prevents the grant', async () => {
    policy.newAccountUnlimitedCredits = true;
    execute.mockResolvedValue([]);
    await expect(grantRegistrationCredits({ id: 'u', tenantId: 't' }, tx)).rejects.toThrow('single-account');
  });
  it('propagates database failure to roll back account and invite consumption', async () => {
    policy.newAccountUnlimitedCredits = true;
    execute.mockRejectedValue(new Error('database failure'));
    await expect(grantRegistrationCredits({ id: 'u', tenantId: 't' }, tx)).rejects.toThrow('database failure');
  });
});
