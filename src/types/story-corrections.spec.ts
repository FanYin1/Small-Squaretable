import { describe, expect, it } from 'vitest';
import { branchInputSchema, readingInputSchema, safeReadingLayout } from './story-corrections';

describe('correction contract', () => {
  it('accepts only empty-line spacing changes', () => {
    expect(safeReadingLayout('灯亮了。\n她认真回应。', '灯亮了。\n\n她认真回应。')).toBe(true);
    expect(safeReadingLayout('灯亮了。', '灯灭了。')).toBe(false);
    expect(safeReadingLayout('钱款100。', '钱款100。\n现在200。')).toBe(false);
    expect(safeReadingLayout('没有付钱。', '没有付钱。')).toBe(false);
  });
  it.each(['**灯亮了**\n第二行', '- 第一项\n第二行', '<script>test</script>\n第二行', '```\ncode\n```'])('refuses uncertain markdown or active markup', original => {
    expect(safeReadingLayout(original, original.replace('\n', '\n\n'))).toBe(false);
  });
  it('preserves indentation in layout input while trimming annotations', () => {
    const input = { requestId: '11111111-1111-4111-8111-111111111111', messageId: 1, kind: 'layout', content: '  灯亮了。\n\n  她回应。\n' };
    const parsed = readingInputSchema.parse(input);
    expect(parsed.content).toBe(input.content);
    expect(safeReadingLayout('  灯亮了。\n  她回应。\n', parsed.content)).toBe(true);
    expect(safeReadingLayout('  灯亮了。\n  她回应。\n', parsed.content.trim())).toBe(false);
    expect(readingInputSchema.parse({ ...input, kind: 'annotation', content: '  标注  ' }).content).toBe('标注');
  });
  it('requires distinct visible evidence for conflict interpretation', () => {
    const input = { requestId: '11111111-1111-4111-8111-111111111111', throughVersion: 0, mode: 'conflict', direction: '采用这份解释', evidenceIds: [1, 1] };
    expect(branchInputSchema.safeParse(input).success).toBe(false);
    expect(branchInputSchema.safeParse({ ...input, evidenceIds: [1, 2] }).success).toBe(true);
    expect(branchInputSchema.safeParse({ ...input, evidenceIds: [1, 2], values: { coins: 999 } }).success).toBe(false);
  });
});
