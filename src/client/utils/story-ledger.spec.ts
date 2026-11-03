import { describe, expect, it } from 'vitest';
import { projectStoryLedger, ledgerStreamingText } from './story-ledger';
import { ledgerFixture } from './fixtures/story-ledger';

describe('presentation-only merchant ledger', () => {
  it.each(['\n', '\r\n'])('folds complete known format while preserving surrounding narrative (%s)', newline => {
    const raw = ledgerFixture.replaceAll('\n', newline);
    const text = `门边有人等候。\n\n${raw}\n\n<details><summary>摘要</summary>原来的摘要</details>`;
    const projected = projectStoryLedger(text);
    expect(projected.content).toBe('门边有人等候。\n\n<details><summary>摘要</summary>原来的摘要</details>');
    expect(projected.ledger?.raw).toBe(raw);
    expect(projected.ledger?.summary).toEqual(['现金 200文', '信誉 旅商', '地点 测试街市', '库存 2类']);
    expect(projected.ledger?.inventory).toEqual([{ name: '青纸', quantity: '2', price: '10文' }, { name: '细绳', quantity: '3', price: '4文' }]);
    expect(projected.ledger?.sections[4].text).toContain('预计日收益:5文');
  });
  it.each([
    ledgerFixture.replace('[商贾宝鉴末]', ''),
    ledgerFixture.replace('[/流动资产]', ''),
    ledgerFixture.replace('theme: eastern_commerce', 'theme: unknown'),
    ledgerFixture.replace('[市场动态]', '[未知模块]'),
    ledgerFixture.replace('详情: 无田产', '<script>alert(1)</script>'),
    `引用${ledgerFixture}`,
    '```text\n' + ledgerFixture + '\n```',
    ledgerFixture + '\n' + ledgerFixture,
    ledgerFixture.replace('[/市场动态]', '[/市场动态]\n遗漏的正文'),
    '普通文字 [现金] 与【物品】',
  ])('retains malformed, unsafe or unrecognized content without silently dropping it', text => {
    expect(projectStoryLedger(text)).toEqual({ content: text, ledger: null });
  });
  it('keeps unparsed inventory as original text and never invents quantity or value', () => {
    const result = projectStoryLedger(ledgerFixture.replace('【青纸】 x2 (市价:10文)', '青纸若干，价格未知'));
    expect(result.ledger?.inventory).toBeNull();
    expect(result.ledger?.sections[2].text).toContain('青纸若干，价格未知');
    expect(result.ledger?.summary).not.toContain('库存 2类');
  });
  it('buffers recognized streaming metadata but restores incomplete data on final rendering', () => {
    const text = '原有正文。\n' + ledgerFixture;
    const cutoff = text.indexOf('[商品库存]');
    expect(ledgerStreamingText(text.slice(0, cutoff))).toBe('原有正文。');
    expect(projectStoryLedger(text.slice(0, cutoff)).content).toBe(text.slice(0, cutoff));
    expect(ledgerStreamingText(text)).toBe('原有正文。');
    const unknown = text.replace('theme: eastern_commerce', 'theme: other');
    expect(ledgerStreamingText(unknown.slice(0, cutoff))).toBe(unknown.slice(0, cutoff));
  });
});
