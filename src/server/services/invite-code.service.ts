/**
 * 邀请码服务
 *
 * 注册采用邀请码制（backlog P0-6）。两条建号路径（邮箱注册、OAuth 首次登录）
 * 都通过 createAccountWithInvite 建号，保证校验在 service 层、消费与建号同一事务。
 */

import crypto from 'crypto';
import { inviteCodeRepository } from '../../db/repositories/invite-code.repository';
import type { DbTransaction } from '../../db/repositories/base.repository';
import type { InviteCode } from '../../db/schema/invite-codes';
import { AppError, NotFoundError } from '../../core/errors';
import { auditService } from './audit.service';

export type InviteCodeErrorCode = 'INVITE_CODE_REQUIRED' | 'INVITE_CODE_INVALID';

/**
 * 邀请码校验失败。统一 400，code 供前端映射成可读提示。
 *
 * 「不存在 / 已过期 / 已用尽 / 已禁用」故意合并成 INVALID：
 * 消费是单条条件 UPDATE，本来也分不出原因；而且区分原因等于告诉攻击者
 * 「这个码存在，只是过期了」，对猜码没有好处。
 */
export class InviteCodeError extends AppError {
  constructor(code: InviteCodeErrorCode) {
    super(
      code === 'INVITE_CODE_REQUIRED' ? 'Invite code is required' : 'Invite code is invalid or no longer usable',
      400,
      code,
    );
    this.name = 'InviteCodeError';
  }
}

/** 去空白、转大写：输入大小写不敏感，库里统一存大写。非字符串视为空。 */
export function normalizeInviteCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

// 去掉容易看错的 0/O、1/I。32 个字符里剩 31 个，12 位约 59 bit 熵。
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 生成形如 ABCD-2345-WXYZ 的码。randomInt 无取模偏差。 */
export function generateInviteCode(): string {
  const group = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

export interface SignupContext {
  source: 'register' | 'oauth';
  provider?: string;
  actorIp?: string;
}

export interface GenerateInput {
  count: number;
  maxUses: number;
  expiresAt?: Date | null;
  note?: string | null;
}

export interface AdminActor {
  adminId: string;
  tenantId: string;
  actorIp?: string;
}

export const inviteCodeService = {
  /**
   * 在一个事务里：原子消费邀请码 → 建账号 → 记录使用。
   *
   * createAccount 收到事务对象，所有写库都必须用它，否则不在事务里。
   * 消费放在建号之前：无效码直接失败，不会先建出用户再回滚；
   * 建号或记录使用任何一步抛错，整个事务回滚，used_count 随之回退。
   * 审计在提交之后写（fire-and-forget），回滚的注册不会留下审计。
   */
  async createAccountWithInvite<T extends { id: string; tenantId: string }>(
    rawCode: unknown,
    context: SignupContext,
    createAccount: (tx: DbTransaction) => Promise<T>,
  ): Promise<T> {
    const code = normalizeInviteCode(rawCode);
    if (!code) {
      throw new InviteCodeError('INVITE_CODE_REQUIRED');
    }

    const { account, codeId } = await inviteCodeRepository.withTransaction(async (tx) => {
      const consumed = await inviteCodeRepository.consume(code, tx);
      if (!consumed) {
        throw new InviteCodeError('INVITE_CODE_INVALID');
      }

      const created = await createAccount(tx);
      await inviteCodeRepository.recordUse({ codeId: consumed.id, userId: created.id }, tx);
      return { account: created, codeId: consumed.id };
    });

    auditService.log({
      tenantId: account.tenantId,
      actorId: account.id,
      actorIp: context.actorIp,
      action: 'invite_code_use',
      targetType: 'invite_code',
      targetId: codeId,
      metadata: {
        code,
        source: context.source,
        ...(context.provider ? { provider: context.provider } : {}),
      },
    });

    return account;
  },

  async generate(input: GenerateInput, actor: AdminActor): Promise<InviteCode[]> {
    const rows = Array.from({ length: input.count }, () => ({
      code: generateInviteCode(),
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ?? null,
      note: input.note ?? null,
      createdBy: actor.adminId,
    }));

    const created = await inviteCodeRepository.createMany(rows);

    auditService.log({
      tenantId: actor.tenantId,
      actorId: actor.adminId,
      actorIp: actor.actorIp,
      action: 'invite_code_create',
      metadata: {
        count: input.count,
        maxUses: input.maxUses,
        expiresAt: input.expiresAt?.toISOString() ?? null,
      },
    });

    return created;
  },

  list(params: { page: number; limit: number }) {
    return inviteCodeRepository.list(params);
  },

  async listUses(codeId: string) {
    const code = await inviteCodeRepository.findById(codeId);
    if (!code) throw new NotFoundError('Invite code');
    return inviteCodeRepository.findUses(codeId);
  },

  async disable(id: string, actor: AdminActor): Promise<InviteCode> {
    const updated = await inviteCodeRepository.disable(id);
    if (!updated) throw new NotFoundError('Invite code');

    auditService.log({
      tenantId: actor.tenantId,
      actorId: actor.adminId,
      actorIp: actor.actorIp,
      action: 'invite_code_disable',
      targetType: 'invite_code',
      targetId: id,
      metadata: { code: updated.code },
    });

    return updated;
  },
};
