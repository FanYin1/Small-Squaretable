import type { LocationQuery, LocationQueryRaw } from 'vue-router';

export interface StoryDiscoveryQuery {
  q: string;
  category: string;
  tags: string[];
  sort: string;
  page: number;
}

const categories = ['', 'assistant', 'entertainment', 'education', 'game', 'historical', 'modern'];
const sorts = ['popular', 'newest', 'rating', 'relevance'];

export function readStoryDiscoveryQuery(query: LocationQuery): StoryDiscoveryQuery {
  const category = typeof query.category === 'string' ? query.category : '';
  const sort = typeof query.sort === 'string' ? query.sort : '';
  const page = typeof query.page === 'string' ? Number(query.page) : 1;
  const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
  return {
    q: typeof query.q === 'string' ? query.q.slice(0, 200) : '',
    category: categories.includes(category) ? category : '',
    tags: [...new Set(tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0 && tag.length <= 80))].slice(0, 10),
    sort: sorts.includes(sort) ? sort : 'popular',
    page: Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1,
  };
}

export function writeStoryDiscoveryQuery(state: StoryDiscoveryQuery, current: LocationQuery = {}): LocationQueryRaw {
  const query: LocationQueryRaw = { ...current };
  for (const key of ['q', 'category', 'tags', 'sort', 'page']) delete query[key];
  if (state.q.trim()) query.q = state.q.trim();
  if (state.category) query.category = state.category;
  if (state.tags.length) query.tags = [...state.tags];
  if (state.sort !== 'popular') query.sort = state.sort;
  if (state.page !== 1) query.page = String(state.page);
  return query;
}
