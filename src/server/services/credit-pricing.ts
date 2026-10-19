/**
 * 点数定价估算：纯函数部分（P3-1）
 *
 * scripts/credit-pricing-estimate.ts 负责只读查库，这里负责把统计结果渲染成 markdown，
 * 以及「样本是否足够」的诚实提示。拆出来是为了能写单测，不依赖数据库。
 */

export interface Distribution {
  count: number;
  mean: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
}

export interface PlanPricingRow {
  plan: string;
  /** 窗口内该套餐的生成次数与活跃租户数 */
  generations: number;
  tenants: number;
  perGeneration: Distribution | null;
  /** 租户-月总量分布（窗口内每个租户每个自然月一个样本） */
  perTenantMonth: Distribution | null;
}

export interface ProviderCost {
  /** 每百万输入 / 输出 token 的成本，货币单位由 currency 说明 */
  inputPerMTok: number;
  outputPerMTok: number;
  currency: string;
}

export interface PricingReportInput {
  generatedAt: string;
  windowDays: number;
  tokensPerPoint: number;
  total: Distribution | null;
  prompt: Distribution | null;
  completion: Distribution | null;
  /** token 来源计数：provider = 上游 usage，estimate = 本地估算，unknown = 老数据没记 */
  sources: { provider: number; estimate: number; unknown: number };
  byPlan: PlanPricingRow[];
  providerCost?: ProviderCost;
}

/** 少于这个数的样本，分位数（尤其 P99）没有统计意义 */
export const MIN_GENERATIONS_FOR_PERCENTILES = 100;
export const MIN_TENANTS_FOR_MONTHLY_PERCENTILES = 10;

/**
 * 估算报告用的换算，不取整、不读 config（本模块保持纯函数）。
 * 账本与用户展示请用 credit-units 的 tokensToPoints（按 POINT_DECIMALS 取整）。
 */
export function tokensToPointsUnrounded(tokens: number, tokensPerPoint: number): number {
  return tokens / tokensPerPoint;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtPoints(tokens: number, tokensPerPoint: number): string {
  const points = tokensToPointsUnrounded(tokens, tokensPerPoint);
  return points >= 100 ? points.toFixed(0) : points >= 1 ? points.toFixed(2) : points.toFixed(4);
}

function distRow(label: string, dist: Distribution | null, tokensPerPoint: number): string {
  if (!dist || dist.count === 0) return `| ${label} | 0 | - | - | - | - | - |`;
  const cells = [dist.mean, dist.p50, dist.p90, dist.p99, dist.max]
    .map((tokens) => `${fmtInt(tokens)} (${fmtPoints(tokens, tokensPerPoint)})`)
    .join(' | ');
  return `| ${label} | ${fmtInt(dist.count)} | ${cells} |`;
}

const DIST_HEADER = [
  '| 口径 | 样本数 | 均值 token (点) | P50 | P90 | P99 | 最大 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
];

/** 样本是否足够的结论，调用方也用它决定要不要把数字当真 */
export function assessSampleSize(input: PricingReportInput): string[] {
  const warnings: string[] = [];
  const generations = input.total?.count ?? 0;

  if (generations === 0) {
    warnings.push('窗口内没有任何带 token 记录的生成，以下没有可用数字。');
    return warnings;
  }
  if (generations < MIN_GENERATIONS_FOR_PERCENTILES) {
    warnings.push(
      `全部套餐合计只有 ${generations} 次生成（少于 ${MIN_GENERATIONS_FOR_PERCENTILES}），` +
        'P90 / P99 基本等于最大的几个样本，只能当量级参考，不能据此定价。',
    );
  }
  for (const row of input.byPlan) {
    if (row.generations > 0 && row.tenants < MIN_TENANTS_FOR_MONTHLY_PERCENTILES) {
      warnings.push(
        `套餐 ${row.plan} 只有 ${row.tenants} 个活跃租户（少于 ${MIN_TENANTS_FOR_MONTHLY_PERCENTILES}），` +
          '「租户月用量」分位数代表性不足。',
      );
    }
  }
  const { provider, estimate, unknown } = input.sources;
  const known = provider + estimate + unknown;
  if (known > 0 && provider / known < 0.5) {
    warnings.push(
      `只有 ${Math.round((provider / known) * 100)}% 的记录来自上游返回的真实 usage，` +
        `其余是本地估算（${estimate}）或未标注来源（${unknown}），中文 / 长上下文下估算可能偏离。`,
    );
  }
  return warnings;
}

function renderProviderCost(input: PricingReportInput): string[] {
  const cost = input.providerCost;
  if (!cost) {
    return [
      '未提供上游价格（--input-price / --output-price / --currency），因此不输出成本和毛利，',
      '这里不替运营者猜价格。拿到上游单价后重跑即可。',
    ];
  }
  const prompt = input.prompt?.mean ?? 0;
  const completion = input.completion?.mean ?? 0;
  const total = prompt + completion;
  if (total <= 0 || !input.total) {
    return ['没有输入 / 输出拆分数据，无法折算成本。'];
  }
  // 以窗口内平均输入 / 输出占比折算每 token 的混合成本
  const blendedPerToken =
    ((prompt / total) * cost.inputPerMTok + (completion / total) * cost.outputPerMTok) / 1_000_000;
  const perPoint = blendedPerToken * input.tokensPerPoint;
  const money = (n: number) => `${n.toFixed(4)} ${cost.currency}`;

  return [
    `按窗口内平均输入占比 ${((prompt / total) * 100).toFixed(1)}% / 输出占比 ${((completion / total) * 100).toFixed(1)}%，`,
    `混合上游成本约 ${money(blendedPerToken * 1_000_000)} / 百万 token。`,
    '',
    `- 1 点的上游成本：${money(perPoint)}`,
    `- 单次生成上游成本：P50 ${money(input.total.p50 * blendedPerToken)}，` +
      `P90 ${money(input.total.p90 * blendedPerToken)}，P99 ${money(input.total.p99 * blendedPerToken)}`,
    `- 1 点的售价至少要高于 ${money(perPoint)} 才不亏本；具体加价由运营者决定。`,
  ];
}

function renderPlanSection(row: PlanPricingRow, tokensPerPoint: number): string[] {
  return [
    `### ${row.plan}（${fmtInt(row.generations)} 次生成，${fmtInt(row.tenants)} 个租户）`,
    '',
    ...DIST_HEADER,
    distRow('单次生成', row.perGeneration, tokensPerPoint),
    distRow('租户月用量', row.perTenantMonth, tokensPerPoint),
    '',
  ];
}

/** 渲染完整 markdown 报告 */
export function renderPricingReport(input: PricingReportInput): string {
  const tpp = input.tokensPerPoint;
  const lines: string[] = [
    '# 点数定价估算',
    '',
    `- 生成时间：${input.generatedAt}`,
    `- 统计窗口：最近 ${input.windowDays} 天`,
    `- 换算：1 点 = ${fmtInt(tpp)} token（括号内为点数）`,
    '- 数据来源：`usage` 表中 `llm_tokens` 记录，每条 = 一次生成（输入 + 输出）',
    '',
    '## 样本说明',
    '',
  ];

  const warnings = assessSampleSize(input);
  lines.push(...(warnings.length ? warnings.map((w) => `- ${w}`) : ['- 样本量满足基本统计要求。']), '');

  lines.push('## 全部套餐：单次生成的 token 分布', '', ...DIST_HEADER);
  lines.push(distRow('总量（输入 + 输出）', input.total, tpp));
  lines.push(distRow('输入', input.prompt, tpp));
  lines.push(distRow('输出', input.completion, tpp), '');
  lines.push(
    `token 来源：上游 usage ${fmtInt(input.sources.provider)}，本地估算 ${fmtInt(input.sources.estimate)}，` +
      `未标注 ${fmtInt(input.sources.unknown)}`,
    '',
  );

  lines.push('## 按套餐', '');
  if (input.byPlan.length === 0) {
    lines.push('窗口内没有数据。', '');
  } else {
    for (const row of input.byPlan) lines.push(...renderPlanSection(row, tpp));
  }

  lines.push('## 上游成本折算', '', ...renderProviderCost(input), '');
  lines.push(
    '## 读数字之前',
    '',
    '- 「租户月用量」是当前订阅制下的真实用量，预付点数后用户行为（更省或更放开）可能不同。',
    '- 点数按实际消耗结算，单次生成的冻结额度（输入估算 x 1.2 + 输出上限）只影响可用余额，不影响扣费。',
    '- 本报告只读数据库，不写任何数据。',
    '',
  );

  return lines.join('\n');
}
