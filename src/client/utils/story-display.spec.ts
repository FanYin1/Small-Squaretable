import { describe, expect, it } from 'vitest';
import { storyDisplayText, stripStoryControlBlocks } from './story-display';

describe('story display projection', () => {
  it('uses the same CJK emphasis boundaries for previews while keeping literal code', () => {
    const content = '要求是**“连续”**。 `**“原样”**`';
    expect(storyDisplayText(content)).toBe('要求是“连续”。 **“原样”**');
    expect(content).toContain('**“连续”**');
  });
  it.each(['VariableInsert', 'VariableEdit', 'VariableUpdate', 'VariableDelete', 'UpdateVariable', 'era_data', 'variablethink'])('hides %s without changing surrounding narration', tag => {
    const original = `<${tag} version="1">{"secret":42}</${tag}><content>你到了，{{user}}。</content>`;
    expect(storyDisplayText(original, { userName: '旅人' })).toBe('你到了，旅人。');
    expect(original).toContain('"secret":42');
  });

  it('does not leak nested or unfinished control blocks while streaming', () => {
    expect(stripStoryControlBlocks('你好<VariableInsert>{<VariableInsert>inner</VariableInsert>tail}</VariableInsert>再见')).toBe('你好再见');
    expect(storyDisplayText('你好<UpdateVariable>unfinished secret')).toBe('你好');
    expect(storyDisplayText('你好<VariableInsert version="')).toBe('你好');
    expect(storyDisplayText('你好<UpdateVariable/>再见')).toBe('你好再见');
  });

  it('preserves prose, punctuation, links and paragraph boundaries without HTML source', () => {
    expect(storyDisplayText('<content>“你好！” **她说。**\n\n[去车站](https://invalid.example)</content>', { multiline: true })).toBe('“你好！” 她说。\n\n去车站');
    expect(storyDisplayText('```html\n<div>街道</div><script>secret()</script><style>.secret{}</style>\n```')).toBe('街道');
    expect(storyDisplayText('守住城门。<iframe src="https://invalid.example">hidden</iframe>')).toBe('守住城门。');
  });

  it('removes controls before truncation and substitutes macro values literally', () => {
    expect(storyDisplayText(`<VariableInsert>${'secret'.repeat(100)}</VariableInsert>你好，世界。`, { limit: 5 })).toBe('你好，世界…');
    expect(storyDisplayText('{{char}}遇见{{user}}', { characterName: '$&', userName: '{{char}}' })).toBe('$&遇见{{char}}');
    expect(storyDisplayText('{{user}}', { userName: '<b>旅人</b>' })).toBe('<b>旅人</b>');
  });
});
