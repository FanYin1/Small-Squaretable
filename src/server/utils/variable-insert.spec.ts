import { describe, it, expect } from 'vitest';
import { extractVariableInserts, extractVariableEdits, extractVariableDeletes, stripEraXmlTags } from './variable-insert';

describe('extractVariableInserts', () => {
  it('extracts simple key-value pairs from a VariableInsert block', () => {
    const text = `Some text <VariableInsert>{"hp": "100", "mp": "50"}</VariableInsert> more text`;
    const result = extractVariableInserts(text);
    expect(result).toEqual([
      { key: 'hp', value: '100' },
      { key: 'mp', value: '50' },
    ]);
  });

  it('flattens nested objects with dot notation', () => {
    const text = `<VariableInsert>{"player": {"name": "Alice", "stats": {"level": 5}}}</VariableInsert>`;
    const result = extractVariableInserts(text);
    expect(result).toEqual([
      { key: 'player.name', value: 'Alice' },
      { key: 'player.stats.level', value: '5' },
    ]);
  });

  it('handles multiple VariableInsert blocks', () => {
    const text = `<VariableInsert>{"a": "1"}</VariableInsert> text <VariableInsert>{"b": "2"}</VariableInsert>`;
    const result = extractVariableInserts(text);
    expect(result).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('skips malformed JSON gracefully', () => {
    const text = `<VariableInsert>{broken json}</VariableInsert>`;
    const result = extractVariableInserts(text);
    expect(result).toEqual([]);
  });

  it('skips empty blocks', () => {
    const text = `<VariableInsert>  </VariableInsert>`;
    const result = extractVariableInserts(text);
    expect(result).toEqual([]);
  });

  it('handles arrays as JSON string values', () => {
    const text = `<VariableInsert>{"items": [1, 2, 3]}</VariableInsert>`;
    const result = extractVariableInserts(text);
    expect(result).toEqual([
      { key: 'items', value: '[1,2,3]' },
    ]);
  });

  it('handles numeric and boolean values', () => {
    const text = `<VariableInsert>{"count": 42, "active": true, "label": null}</VariableInsert>`;
    const result = extractVariableInserts(text);
    expect(result).toEqual([
      { key: 'count', value: '42' },
      { key: 'active', value: 'true' },
      { key: 'label', value: 'null' },
    ]);
  });

  it('is case-insensitive for tag names', () => {
    const text = `<variableinsert>{"x": "1"}</VARIABLEINSERT>`;
    const result = extractVariableInserts(text);
    expect(result).toEqual([{ key: 'x', value: '1' }]);
  });

  it('returns empty array when no blocks present', () => {
    const result = extractVariableInserts('Just normal text without any blocks');
    expect(result).toEqual([]);
  });
});

describe('stripEraXmlTags', () => {
  it('strips VariableInsert blocks', () => {
    const text = `Hello <VariableInsert>{"hp": 100}</VariableInsert> world`;
    expect(stripEraXmlTags(text)).toBe('Hello  world');
  });

  it('strips multiple ERA tag types', () => {
    const text = `A<era_data>stuff</era_data>B<variablethink>think</variablethink>C`;
    expect(stripEraXmlTags(text)).toBe('ABC');
  });

  it('returns original text when no ERA tags present', () => {
    const text = 'Normal text here';
    expect(stripEraXmlTags(text)).toBe('Normal text here');
  });
});

describe('extractVariableEdits', () => {
  it('extracts key-value updates from VariableEdit block', () => {
    const text = `<VariableEdit>{"hp": "80", "status": "injured"}</VariableEdit>`;
    const result = extractVariableEdits(text);
    expect(result).toEqual([
      { key: 'hp', value: '80' },
      { key: 'status', value: 'injured' },
    ]);
  });

  it('flattens nested objects', () => {
    const text = `<VariableEdit>{"player": {"hp": "50"}}</VariableEdit>`;
    expect(extractVariableEdits(text)).toEqual([{ key: 'player.hp', value: '50' }]);
  });

  it('skips malformed JSON', () => {
    expect(extractVariableEdits('<VariableEdit>bad</VariableEdit>')).toEqual([]);
  });

  it('returns empty when no blocks', () => {
    expect(extractVariableEdits('no blocks here')).toEqual([]);
  });
});

describe('extractVariableDeletes', () => {
  it('extracts keys from JSON array format', () => {
    const text = `<VariableDelete>["hp", "mp"]</VariableDelete>`;
    expect(extractVariableDeletes(text)).toEqual(['hp', 'mp']);
  });

  it('extracts keys from comma-separated format', () => {
    const text = `<VariableDelete>hp, mp, status</VariableDelete>`;
    expect(extractVariableDeletes(text)).toEqual(['hp', 'mp', 'status']);
  });

  it('handles multiple delete blocks', () => {
    const text = `<VariableDelete>["a"]</VariableDelete> text <VariableDelete>b, c</VariableDelete>`;
    expect(extractVariableDeletes(text)).toEqual(['a', 'b', 'c']);
  });

  it('skips empty blocks', () => {
    expect(extractVariableDeletes('<VariableDelete>  </VariableDelete>')).toEqual([]);
  });

  it('returns empty when no blocks', () => {
    expect(extractVariableDeletes('nothing here')).toEqual([]);
  });
});
