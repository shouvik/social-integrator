// src/core/http/ETagCache.ts

import type { ETagKey, HttpResponse } from './types';

interface CachedETagData<T = unknown> {
  etag: string;
  payload: HttpResponse<T>;
  timestamp: number;
}

export class ETagCache {
  private cache: Map<string, CachedETagData> = new Map();
  private maxSize = 1000;
  public ttl = 3600000; // 1 hour
  
  get<T>(key: ETagKey): CachedETagData<T> | undefined {
    const cacheKey = this.createKey(key);
    const cached = this.cache.get(cacheKey) as CachedETagData<T> | undefined;
    
    if (!cached) return undefined;
    
    // Check TTL
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(cacheKey);
      return undefined;
    }
    
    return cached;
  }
  
  set<T>(key: ETagKey, payload: HttpResponse<T>, etag: string | undefined): void {
    if (!etag) return; // Skip if no ETag provided
    
    const cacheKey = this.createKey(key);
    
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(cacheKey, {
      etag,
      payload,
      timestamp: Date.now()
    });
  }
  
  getETag(key: ETagKey): string | undefined {
    return this.get(key)?.etag;
  }
  
  private createKey(key: ETagKey): string {
    return `${key.userId}:${key.provider}:${key.resource}`;
  }
}

