type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  pending?: Promise<T>;
};

const memCache = new Map<string, CacheEntry<unknown>>();

export async function getOrRefresh<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = memCache.get(key) as CacheEntry<T> | undefined;

  if (entry && entry.expiresAt > now) return entry.value;
  if (entry?.pending) return entry.pending;

  const promise = fetcher()
    .then((value) => {
      memCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      if (entry) {
        memCache.set(key, { value: entry.value, expiresAt: Date.now() + 5000 });
        return entry.value;
      }
      throw err;
    });

  memCache.set(key, {
    value: entry?.value as T,
    expiresAt: entry?.expiresAt ?? 0,
    pending: promise,
  });

  return promise;
}

export function invalidate(key: string): void {
  memCache.delete(key);
}
