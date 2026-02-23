import { describe, it, expect } from 'vitest';
import { highlightText, escapeRegex } from './highlight';

describe('highlightText', () => {
  it('highlights matching keyword with <mark> tag', () => {
    const result = highlightText('Hello world', 'world');
    expect(result).toBe('Hello <mark class="search-highlight">world</mark>');
  });

  it('returns escaped HTML when no query provided', () => {
    const result = highlightText('Hello <script>alert(1)</script>', '');
    expect(result).toBe('Hello &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes <script> tags in source text before highlighting', () => {
    const result = highlightText('<script>alert(1)</script> Hello world', 'world');
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt; Hello <mark class="search-highlight">world</mark>');
  });

  it('handles multiple keywords', () => {
    const result = highlightText('Hello beautiful world', 'hello world');
    expect(result).toBe('<mark class="search-highlight">Hello</mark> beautiful <mark class="search-highlight">world</mark>');
  });

  it('returns empty string for null/undefined input', () => {
    expect(highlightText(null as any, 'test')).toBe('');
    expect(highlightText(undefined as any, 'test')).toBe('');
    expect(highlightText('', 'test')).toBe('');
  });

  it('escapes HTML entities in the text', () => {
    const result = highlightText('Use <div> & "quotes"', '');
    expect(result).toBe('Use &lt;div&gt; &amp; &quot;quotes&quot;');
  });

  it('preserves case-insensitive matching while highlighting', () => {
    const result = highlightText('HELLO Hello hello', 'hello');
    expect(result).toBe(
      '<mark class="search-highlight">HELLO</mark> <mark class="search-highlight">Hello</mark> <mark class="search-highlight">hello</mark>'
    );
  });

  it('escapes dangerous HTML attributes in source text', () => {
    const result = highlightText('<img src=x onerror=alert(1)>', '');
    expect(result).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('escapeRegex', () => {
  it('escapes special regex characters', () => {
    expect(escapeRegex('hello.world')).toBe('hello\\.world');
    expect(escapeRegex('test*')).toBe('test\\*');
    expect(escapeRegex('a+b')).toBe('a\\+b');
    expect(escapeRegex('[test]')).toBe('\\[test\\]');
    expect(escapeRegex('(a|b)')).toBe('\\(a\\|b\\)');
  });

  it('returns string unchanged if no special characters', () => {
    expect(escapeRegex('hello')).toBe('hello');
    expect(escapeRegex('world123')).toBe('world123');
  });
});
