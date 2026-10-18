/**
 * 点数定价估算（P3-1）
 *
 * 只读：在 READ ONLY 事务里查 usage 表（llm_tokens），按真实 token 分布输出 markdown。
 * 不写库、不跑迁移。数据少时报告里会如实写出「样本不足」。
 *
 * Usage:
 *   npx tsx scripts/credit-pricing-estimate.ts [--days 30] [--out report.md]
 *     [--tokens-per-point 10000] [--input-price 1.2] [--output-price 4.8] [--currency CNY]
 *
 * 价格单位：每百万 token。不给价格就不输出成本（不替运营者猜上游价格）。
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  renderPricingReport,
  type Distribution,
  type PlanPricingRow,
  type PricingReportInput,
  type ProviderCost,
} from '../src/server/services/credit-pricing';

interface CliOptions {
  days: number;
  out: string | null;
  tokensPerPoint: number;
  inputPrice: number | null;
  outputPrice: number | null;
  currency: string;
}

function parsePositive(name: string, raw: string | undefined, allowZero = false): number {
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`参数 ${name} 需要一个${allowZero ? '非负' : '正'}数字，收到：${raw ?? '(空)'}`);
  }
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    days: 30,
    out: null,
    tokensPerPoint: Number(process.env.CREDIT_TOKENS_PER_POINT) || 10000,
    inputPrice: null,
    outputPrice: null,
    currency: 'CNY',
  };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--days':
        options.days = Math.floor(parsePositive(flag, value));
        break;
      case '--out':
        if (!value) throw new Error('参数 --out 需要文件路径');
        options.out = value;
        break;
      case '--tokens-per-point':
        options.tokensPerPoint = parsePositive(flag, value);
        break;
      case '--input-price':
        options.inputPrice = parsePositive(flag, value, true);
        break;
      case '--output-price':
        options.outputPrice = parsePositive(flag, value, true);
        break;
      case '--currency':
        if (!value) throw new Error('参数 --currency 需要币种');
        options.currency = value;
        break;
      default:
        throw new Error(`未知参数：${flag}`);
    }
  }
  if ((options.inputPrice === null) !== (options.outputPrice === null)) {
    throw new Error('--input-price 和 --output-price 必须同时提供');
  }
  return options;
}

type Sql = postgres.TransactionSql;

interface DistRow {
  n: string;
  mean: string | null;
  p50: number | null;
  p90: number | null;
  p99: number | null;
  max: number | null;
}

function toDistribution(row: DistRow | undefined): Distribution | null {
  if (!row || Number(row.n) === 0) return null;
  return {
    count: Number(row.n),
    mean: Number(row.mean ?? 0),
    p50: Number(row.p50 ?? 0),
    p90: Number(row.p90 ?? 0),
    p99: Number(row.p99 ?? 0),
    max: Number(row.max ?? 0),
  };
}

// 每条 usage = 一次生成。prompt / completion 来自 metadata，老数据没有时按 0 计入总量。
const PER_GENERATION = (sql: Sql, days: number) => sql`
  SELECT u.tenant_id,
         COALESCE(s.plan::text, 'free') AS plan,
         u.amount::float8 AS total,
         COALESCE((u.metadata->>'promptTokens')::float8, 0) AS prompt,
         COALESCE((u.metadata->>'completionTokens')::float8, 0) AS completion,
         COALESCE(u.metadata->>'tokenSource', 'unknown') AS source,
         u.period
  FROM usage u
  LEFT JOIN subscriptions s ON s.tenant_id = u.tenant_id
  WHERE u.resource_type = 'llm_tokens'
    AND u.amount > 0
    AND u.created_at >= now() - make_interval(days => ${days})
`;

async function distribution(sql: Sql, days: number, column: 'total' | 'prompt' | 'completion', plan?: string) {
  const col = sql(column);
  const planFilter = plan ? sql`WHERE plan = ${plan}` : sql``;
  const rows = await sql<DistRow[]>`
    WITH g AS (${PER_GENERATION(sql, days)})
    SELECT count(*)::text AS n,
           avg(${col})::text AS mean,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ${col}) AS p50,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY ${col}) AS p90,
           percentile_cont(0.99) WITHIN GROUP (ORDER BY ${col}) AS p99,
           max(${col}) AS max
    FROM g ${planFilter}
  `;
  return toDistribution(rows[0]);
}

async function perTenantMonth(sql: Sql, days: number, plan: string) {
  const rows = await sql<DistRow[]>`
    WITH g AS (${PER_GENERATION(sql, days)}),
    m AS (SELECT tenant_id, period, sum(total) AS tokens FROM g WHERE plan = ${plan} GROUP BY tenant_id, period)
    SELECT count(*)::text AS n,
           avg(tokens)::text AS mean,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY tokens) AS p50,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY tokens) AS p90,
           percentile_cont(0.99) WITHIN GROUP (ORDER BY tokens) AS p99,
           max(tokens) AS max
    FROM m
  `;
  return toDistribution(rows[0]);
}

async function collect(sql: Sql, options: CliOptions): Promise<PricingReportInput> {
  const { days } = options;

  const [total, prompt, completion] = await Promise.all([
    distribution(sql, days, 'total'),
    distribution(sql, days, 'prompt'),
    distribution(sql, days, 'completion'),
  ]);

  const sourceRows = await sql<{ source: string; n: string }[]>`
    WITH g AS (${PER_GENERATION(sql, days)})
    SELECT source, count(*)::text AS n FROM g GROUP BY source
  `;
  const sources = { provider: 0, estimate: 0, unknown: 0 };
  for (const row of sourceRows) {
    if (row.source === 'provider') sources.provider += Number(row.n);
    else if (row.source === 'estimate') sources.estimate += Number(row.n);
    else sources.unknown += Number(row.n);
  }

  const planRows = await sql<{ plan: string; generations: string; tenants: string }[]>`
    WITH g AS (${PER_GENERATION(sql, days)})
    SELECT plan, count(*)::text AS generations, count(DISTINCT tenant_id)::text AS tenants
    FROM g GROUP BY plan ORDER BY plan
  `;
  const byPlan: PlanPricingRow[] = [];
  for (const row of planRows) {
    byPlan.push({
      plan: row.plan,
      generations: Number(row.generations),
      tenants: Number(row.tenants),
      perGeneration: await distribution(sql, days, 'total', row.plan),
      perTenantMonth: await perTenantMonth(sql, days, row.plan),
    });
  }

  const providerCost: ProviderCost | undefined =
    options.inputPrice !== null && options.outputPrice !== null
      ? { inputPerMTok: options.inputPrice, outputPerMTok: options.outputPrice, currency: options.currency }
      : undefined;

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    tokensPerPoint: options.tokensPerPoint,
    total,
    prompt,
    completion,
    sources,
    byPlan,
    providerCost,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未配置');

  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  try {
    // READ ONLY 事务：即使脚本有 bug 也写不了库
    const input = await sql.begin('read only', (tx) => collect(tx, options));
    const markdown = renderPricingReport(input);
    if (options.out) {
      writeFileSync(options.out, markdown, 'utf8');
      process.stderr.write(`已写入 ${options.out}\n`);
    } else {
      process.stdout.write(`${markdown}\n`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  process.stderr.write(`定价估算失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
