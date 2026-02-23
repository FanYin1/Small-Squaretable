/**
 * Search API service
 *
 * Provides global search and typeahead suggestion endpoints.
 */

import { api } from './api';

export interface GlobalSearchParams {
  q: string;
  type?: 'all' | 'characters' | 'messages' | 'worldbooks';
  page?: number;
  limit?: number;
  category?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface GlobalSearchResult {
  characters: any[];
  messages: any[];
  worldbooks: any[];
  total: number;
}

export interface SearchSuggestion {
  characters: Array<{ id: string; name: string; avatarUrl: string | null }>;
  recentSearches: string[];
}

export const searchApi = {
  /**
   * Global search across characters, messages, and worldbooks.
   */
  globalSearch: (params: GlobalSearchParams) => {
    const searchParams = new URLSearchParams();
    searchParams.set('q', params.q);
    if (params.type) searchParams.set('type', params.type);
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.category) searchParams.set('category', params.category);
    if (params.tags?.length) searchParams.set('tags', params.tags.join(','));
    if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params.dateTo) searchParams.set('dateTo', params.dateTo);

    const query = searchParams.toString();
    return api.get<GlobalSearchResult>(`/search?${query}`);
  },

  /**
   * Get typeahead suggestions for a partial query.
   */
  getSuggestions: (q: string) => {
    return api.get<SearchSuggestion>(`/search/suggestions?q=${encodeURIComponent(q)}`);
  },
};
