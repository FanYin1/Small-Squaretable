/**
 * credit-pricing Tests (P3-1)
 */

import { describe, it, expect } from 'vitest';
import {
  assessSampleSize,
  renderPricingReport,
  tokensToPointsUnrounded,
  MIN_GENERATIONS_FOR_PERCENTILES,
  MIN_TENANTS_FOR_MONTHLY_PERCENTILES,
  type Distribution,
  type PricingReportInput,
} from './credit-pricing';

function dist(count: number, overrides: Partial<Distribution> = {}): Distribution {
  return { count, mean: 6200, p50: 5000, p90: 12000, p99: 20000, max: 30000, ...overrides };
}

function input(overrides: Partial<PricingReportInput> = {}): PricingReportInput {
  return {
    generatedAt: '2026-10-18T00:00:00.000Z',
    windowDays: 30,
    tokensPerPoint: 10000,
    total: dist(500),
    prompt: dist(500, { mean: 5000 }),
    completion: dist(500, { mean: 1200 }),
    sources: { provider: 450, estimate: 40, unknown: 10 },
    byPlan: [
      {
        plan: 'free',
        generations: 500,
        tenants: 20,
        perGeneration: dist(500),
        perTenantMonth: dist(20, { mean: 100000 }),
      },
    ],
    ...overrides,
  };
}

describe('tokensToPointsUnrounded', () => {
  it('按 tokensPerPoint 换算，不取整', () => {
    expect(tokensToPointsUnrounded(6200, 10000)).toBeCloseTo(0.62, 10);
    expect(tokensToPointsUnrounded(0, 10000)).toBe(0);
  });
});

describe('assessSampleSize', () => {
  it('样本充足时没有警告', () => {
    expect(assessSampleSize(input())).toEqual([]);
  });

  it('没有数据时只给一条「无可用数字」', () => {
    const warnings = assessSampleSize(input({ total: null, byPlan: [] }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('没有任何带 token 记录');
  });

  it('生成次数刚好达到阈值不警告，少一次就警告', () => {
    const atLimit = assessSampleSize(input({ total: dist(MIN_GENERATIONS_FOR_PERCENTILES) }));
    expect(atLimit).toEqual([]);
    const below = assessSampleSize(input({ total: dist(MIN_GENERATIONS_FOR_PERCENTILES - 1) }));
    expect(below.some((w) => w.includes('不能据此定价'))).toBe(true);
  });

  it('套餐租户数不足时指出是哪个套餐', () => {
    const warnings = assessSampleSize(
      input({
        byPlan: [
          { plan: 'pro', generations: 300, tenants: MIN_TENANTS_FOR_MONTHLY_PERCENTILES - 1, perGeneration: dist(300), perTenantMonth: dist(3) },
        ],
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('pro');
  });

  it('没有生成的套餐不因租户数警告', () => {
    const warnings = assessSampleSize(
      input({ byPlan: [{ plan: 'team', generations: 0, tenants: 0, perGeneration: null, perTenantMonth: null }] }),
    );
    expect(warnings).toEqual([]);
  });

  it('上游真实 usage 占比低于一半时警告', () => {
    const warnings = assessSampleSize(input({ sources: { provider: 10, estimate: 80, unknown: 10 } }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('10%');
  });
});

describe('renderPricingReport', () => {
  it('包含标题、窗口、换算说明和各分布行', () => {
    const md = renderPricingReport(input());
    expect(md).toContain('# 点数定价估算');
    expect(md).toContain('最近 30 天');
    expect(md).toContain('1 点 = 10,000 token');
    expect(md).toContain('| 总量（输入 + 输出） | 500 |');
    expect(md).toContain('6,200 (0.6200)');
    expect(md).toContain('### free（500 次生成，20 个租户）');
    expect(md).toContain('租户月用量');
    expect(md).toContain('样本量满足基本统计要求');
  });

  it('样本不足时报告里带警告，不输出「样本量满足」', () => {
    const md = renderPricingReport(input({ total: dist(5) }));
    expect(md).toContain('不能据此定价');
    expect(md).not.toContain('样本量满足基本统计要求');
  });

  it('完全没有数据时仍能渲染，且不抛错', () => {
    const md = renderPricingReport(
      input({ total: null, prompt: null, completion: null, byPlan: [], sources: { provider: 0, estimate: 0, unknown: 0 } }),
    );
    expect(md).toContain('没有任何带 token 记录');
    expect(md).toContain('窗口内没有数据');
    expect(md).toContain('| 总量（输入 + 输出） | 0 | - |');
  });

  it('没给上游价格时不输出成本数字，也不猜价格', () => {
    const md = renderPricingReport(input());
    expect(md).toContain('未提供上游价格');
    expect(md).not.toContain('1 点的上游成本');
  });

  it('给了上游价格时按输入 / 输出占比折算 1 点成本', () => {
    const md = renderPricingReport(
      input({ providerCost: { inputPerMTok: 1, outputPerMTok: 4, currency: 'USD' } }),
    );
    // 输入 5000 / 输出 1200 => 混合 (5000*1 + 1200*4) / 6200 = 1.5806 USD/MTok => 每点 0.0158 USD
    expect(md).toContain('1 点的上游成本：0.0158 USD');
    expect(md).toContain('P50');
    expect(md).not.toContain('未提供上游价格');
  });

  it('有价格但没有输入输出拆分时说明无法折算', () => {
    const md = renderPricingReport(
      input({ prompt: null, completion: null, providerCost: { inputPerMTok: 1, outputPerMTok: 4, currency: 'USD' } }),
    );
    expect(md).toContain('无法折算成本');
  });

  it('小于 1 点的数值保留 4 位小数，大于等于 100 点取整', () => {
    const md = renderPricingReport(
      input({ total: dist(500, { mean: 500, p50: 500, p90: 500, p99: 500, max: 2_000_000 }) }),
    );
    expect(md).toContain('500 (0.0500)');
    expect(md).toContain('2,000,000 (200)');
  });
});
