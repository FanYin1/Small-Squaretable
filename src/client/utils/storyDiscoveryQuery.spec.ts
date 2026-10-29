import { describe, expect, it } from 'vitest';
import { readStoryDiscoveryQuery, writeStoryDiscoveryQuery } from './storyDiscoveryQuery';
import type { LocationQuery } from 'vue-router';

describe('story discovery query', () => {
  it('round trips search, filters, sort and page while preserving unrelated parameters', () => {
    const state = { q: 'lantern', category: 'game', tags: ['Fantasy', 'Adventure'], sort: 'newest', page: 3 };
    const query = writeStoryDiscoveryQuery(state, { from: 'home', q: 'old' });
    expect(query.from).toBe('home');
    expect(readStoryDiscoveryQuery(query as LocationQuery)).toEqual(state);
  });

  it('rejects invalid pages and unknown categories and sorts', () => {
    for (const page of ['NaN', '-1', '1.5', '10001', 'Infinity']) {
      expect(readStoryDiscoveryQuery({ page, category: 'unknown', sort: 'unknown' })).toEqual({
        q: '', category: '', tags: [], sort: 'popular', page: 1,
      });
    }
  });

  it('bounds repeatable tags and search input and removes default parameters', () => {
    expect(readStoryDiscoveryQuery({ q: 'x'.repeat(300), tags: ['Fantasy', null, '', 'Fantasy', 'x'.repeat(81)] })).toEqual({
      q: 'x'.repeat(200), tags: ['Fantasy'], category: '', sort: 'popular', page: 1,
    });
    expect(writeStoryDiscoveryQuery({ q: ' ', category: '', tags: [], sort: 'popular', page: 1 }, {
      q: 'old', category: 'game', tags: ['Fantasy'], sort: 'newest', page: '2', from: 'home',
    })).toEqual({ from: 'home' });
  });
});
