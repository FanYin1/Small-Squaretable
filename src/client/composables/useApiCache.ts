import { ref, type Ref } from 'vue';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

interface UseApiCacheOptions {
  ttl?: number;        // Time-to-live in ms (default: 60000 = 1 min)
  revalidate?: boolean; // Whether to revalidate stale data (default: true)
}

interface UseApiCacheReturn<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  refresh: () => Promise<void>;
  invalidate: () => void;
}

export function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseApiCacheOptions = {}
): UseApiCacheReturn<T> {
  const { ttl = 60000, revalidate = true } = options;

  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function fetchData(showLoading: boolean) {
    if (showLoading) loading.value = true;
    error.value = null;
    try {
      const result = await fetcher();
      data.value = result;
      cache.set(key, { data: result, timestamp: Date.now(), ttl });
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
    } finally {
      loading.value = false;
    }
  }

  async function refresh() {
    await fetchData(true);
  }

  function invalidate() {
    cache.delete(key);
  }

  // Check cache
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached) {
    data.value = cached.data;
    const isStale = Date.now() - cached.timestamp > cached.ttl;
    if (isStale && revalidate) {
      // Stale — revalidate in background without showing loading
      fetchData(false);
    }
  } else {
    // No cache — fetch with loading indicator
    fetchData(true);
  }

  return { data, loading, error, refresh, invalidate };
}

/** Invalidate all cache entries whose key starts with the given prefix. */
export function invalidateCache(keyPrefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

/** Clear the entire SWR cache. */
export function clearAllCache(): void {
  cache.clear();
}
