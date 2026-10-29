/**
 * P3-1 验收第 2 项：真实 Postgres 上的点数并发检查（预扣 / 结算 / 清扫 / 充值幂等 / 冲正竞态）。
 *
 * 只能对一次性数据库运行：脚本会插入租户、用户与流水，且不清理。
 * 准备一次性库（与开发库同一个容器，结构从开发库只读导出）：
 *
 *   docker exec small-squaretable-postgres createdb -U postgres credit_test
 *   docker exec small-squaretable-postgres sh -c \
 *     'pg_dump -U postgres -s sillytavern_saas | psql -q -v ON_ERROR_STOP=1 -U postgres credit_test'
 *
 * 运行（DATABASE_URL 的库名必须是 credit_test，否则脚本拒绝执行）：
 *
 *   DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/credit_test npx tsx scripts/credit-concurrency-check.ts
 *
 * 用完删除：docker exec small-squaretable-postgres dropdb -U postgres credit_test
 */
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? '';
if (new URL(url.replace(/^postgres(ql)?:/, 'http:')).pathname !== '/credit_test') {
  console.error('Refusing to run: DATABASE_URL must point at the throwaway database "credit_test"');
  process.exit(2);
}

const sqlc = postgres(url, { max: 5 });
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
}

async function newTenant(email: string, topup: number) {
  const [t] = await sqlc`INSERT INTO tenants (name) VALUES (${'t-' + email}) RETURNING id`;
  const [u] = await sqlc`INSERT INTO users (tenant_id, email) VALUES (${t.id}, ${email}) RETURNING id`;
  if (topup > 0) {
    await sqlc`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${t.id}, 'topup', ${topup})`;
  }
  return { tenantId: t.id as string, userId: u.id as string };
}
const ledgerSum = async (tenantId: string) =>
  Number((await sqlc`SELECT COALESCE(SUM(amount),0)::bigint AS s FROM credit_ledger WHERE tenant_id=${tenantId}`)[0].s);
const activeHeld = async (tenantId: string) =>
  Number((await sqlc`SELECT COALESCE(SUM(tokens),0)::bigint AS s FROM credit_reservations WHERE tenant_id=${tenantId} AND status='active'`)[0].s);

async function main() {
  // 动态导入：先过上面的库名检查，再让服务模块按 DATABASE_URL 建连接
  const { creditBilling, InsufficientCreditsError } = await import('../src/server/services/credit-billing.service');
  const { creditService } = await import('../src/server/services/credit.service');
  const stamp = Date.now();

  // 1. 50 concurrent reserves against balance for exactly 10
  {
    const { tenantId } = await newTenant(`a-${stamp}@t.local`, 10_000);
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        creditBilling.reserve({ tenantId, estimatedInputTokens: 0, maxOutputTokens: 1000 }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const bad = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    check('1a exactly 10 of 50 concurrent reserves succeed', ok.length === 10, `ok=${ok.length}`);
    check('1b the other 40 are INSUFFICIENT_CREDITS', bad.every((r) => r.reason instanceof InsufficientCreditsError), `rejected=${bad.length}`);
    check('1c active holds == 10000 <= balance', (await activeHeld(tenantId)) === 10_000);

    // settle all with overshoot (usage 1500 > hold 1000)
    await Promise.all(ok.map((r) => creditBilling.settle(r.value.id, { inputTokens: 700, outputTokens: 800 })));
    const sum = await ledgerSum(tenantId);
    check('1d balance after overshoot settles is 0 (clamped), never negative', sum === 0, `sum=${sum}`);
    check('1e no active holds left', (await activeHeld(tenantId)) === 0);
  }

  // 2. Mixed workers with a concurrent sampler asserting SUM(ledger) >= 0 at all times
  {
    const { tenantId } = await newTenant(`b-${stamp}@t.local`, 20_000);
    let minSeen = Infinity;
    let stop = false;
    const sampler = (async () => {
      while (!stop) {
        minSeen = Math.min(minSeen, await ledgerSum(tenantId));
        await new Promise((r) => setTimeout(r, 2));
      }
    })();
    let charged = 0;
    await Promise.all(
      Array.from({ length: 200 }, async (_, i) => {
        try {
          const hold = await creditBilling.reserve({ tenantId, estimatedInputTokens: 500, maxOutputTokens: 1500 });
          const res = await creditBilling.settle(hold.id, { inputTokens: 600 + (i % 7) * 100, outputTokens: 1000 + (i % 5) * 400 });
          charged += res?.chargedTokens ?? 0;
        } catch (e) {
          if (!(e instanceof InsufficientCreditsError)) throw e;
        }
      }),
    );
    stop = true;
    await sampler;
    const sum = await ledgerSum(tenantId);
    check('2a ledger sum never observed negative', minSeen >= 0, `min=${minSeen}`);
    check('2b final sum == topup - charged', sum === 20_000 - charged && sum >= 0, `sum=${sum} charged=${charged}`);
    check('2c no active holds left', (await activeHeld(tenantId)) === 0);
  }

  // 3. Same hold settled 10x in parallel -> exactly one charge row
  {
    const { tenantId } = await newTenant(`c-${stamp}@t.local`, 5_000);
    const hold = await creditBilling.reserve({ tenantId, estimatedInputTokens: 0, maxOutputTokens: 1000 });
    const res = await Promise.all(
      Array.from({ length: 10 }, () => creditBilling.settle(hold.id, { inputTokens: 100, outputTokens: 100 })),
    );
    const non = res.filter((r) => r !== null).length;
    const rows = Number((await sqlc`SELECT count(*)::int AS c FROM credit_ledger WHERE reservation_id=${hold.id}`)[0].c);
    check('3 parallel settles of one hold -> exactly one charge row', non === 1 && rows === 1, `non-null=${non} rows=${rows}`);
  }

  // 4. Sweep races with settle: expired hold still settles once, ledger stays >= 0
  {
    const { tenantId } = await newTenant(`d-${stamp}@t.local`, 3_000);
    const hold = await creditBilling.reserve({ tenantId, estimatedInputTokens: 0, maxOutputTokens: 1000 });
    await sqlc`UPDATE credit_reservations SET expires_at = now() - interval '1 minute' WHERE id=${hold.id}`;
    const [swept, settled] = await Promise.all([
      creditBilling.sweepExpired(),
      creditBilling.settle(hold.id, { inputTokens: 100, outputTokens: 100 }),
    ]);
    const rows = Number((await sqlc`SELECT count(*)::int AS c FROM credit_ledger WHERE reservation_id=${hold.id}`)[0].c);
    check('4a sweep vs settle: exactly one charge row, sum >= 0', rows === 1 && (await ledgerSum(tenantId)) === 2_800, `swept=${swept} settled=${JSON.stringify(settled)}`);
    const [st] = await sqlc`SELECT status FROM credit_reservations WHERE id=${hold.id}`;
    check('4b reservation ended as settled', st.status === 'settled', st.status);

    // sweep alone, then late settle
    const hold2 = await creditBilling.reserve({ tenantId, estimatedInputTokens: 0, maxOutputTokens: 1000 });
    await sqlc`UPDATE credit_reservations SET expires_at = now() - interval '1 minute' WHERE id=${hold2.id}`;
    const n = await creditBilling.sweepExpired();
    check('4c sweep expires the stale hold and frees the quota', n >= 1 && (await activeHeld(tenantId)) === 0, `swept=${n}`);
    const late = await creditBilling.settle(hold2.id, { inputTokens: 100, outputTokens: 100 });
    check('4d late settle after sweep charges once', late?.chargedTokens === 200 && (await ledgerSum(tenantId)) === 2_600);
  }

  // 5. Top-up idempotency + reverse vs reserve race
  {
    const { tenantId, userId } = await newTenant(`e-${stamp}@t.local`, 0);
    const [admin] = await sqlc`INSERT INTO users (tenant_id, email) VALUES (${tenantId}, ${'op-' + stamp + '@t.local'}) RETURNING id`;
    const actor = { adminId: admin.id as string, tenantId };
    const key = `key-${stamp}`;
    const rs = await Promise.allSettled(
      Array.from({ length: 5 }, () => creditService.topUp({ userId, points: 1, idempotencyKey: key }, actor)),
    );
    const fulfilled = rs.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rows = Number((await sqlc`SELECT count(*)::int AS c FROM credit_ledger WHERE idempotency_key=${key}`)[0].c);
    check('5a 5 parallel top-ups with one idempotency key -> 1 ledger row', rows === 1 && fulfilled.length === 5 && fulfilled.filter((f) => !f.value.replayed).length === 1,
      `rows=${rows} fulfilled=${fulfilled.length}`);
    check('5b top-up stored 10000 tokens (1 point @ 10000/pt), operator recorded',
      (await ledgerSum(tenantId)) === 10_000 && fulfilled[0].value.entry.operatorId === admin.id);

    const topupId = fulfilled[0].value.entry.id as string;
    const [rev, resv] = await Promise.allSettled([
      creditService.reverse(topupId, {}, actor),
      creditBilling.reserve({ tenantId, estimatedInputTokens: 0, maxOutputTokens: 6000 }),
    ]);
    const sum = await ledgerSum(tenantId);
    const held = await activeHeld(tenantId);
    check('5c reverse vs reserve race: held <= ledger sum and sum >= 0', sum >= 0 && held <= sum,
      `reverse=${rev.status} reserve=${resv.status} sum=${sum} held=${held}`);
    const again = await Promise.allSettled([creditService.reverse(topupId, {}, actor)]);
    check('5d second reversal is rejected', again[0].status === 'rejected');
  }

  // 6. DB-level append-only guard
  {
    const { tenantId } = await newTenant(`f-${stamp}@t.local`, 1_000);
    let blocked = false;
    try {
      await sqlc`UPDATE credit_ledger SET amount = amount + 1 WHERE tenant_id=${tenantId}`;
    } catch {
      blocked = true;
    }
    check('6 UPDATE on credit_ledger is rejected by trigger', blocked);
  }

  await sqlc.end();
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
