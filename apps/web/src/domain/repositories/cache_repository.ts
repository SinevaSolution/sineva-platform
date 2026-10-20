export interface CacheRepository {
  get<T>(cache_key: string): Promise<T | null>;
  set<T>(cache_key: string, value: T, ttl_seconds?: number): Promise<void>;
  del(cache_key: string): Promise<void>;
  ping(): Promise<boolean>;
}
