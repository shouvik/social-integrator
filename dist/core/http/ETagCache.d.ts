import type { ETagKey, HttpResponse } from './types';
interface CachedETagData<T = unknown> {
    etag: string;
    payload: HttpResponse<T>;
    timestamp: number;
}
export declare class ETagCache {
    private cache;
    private maxSize;
    ttl: number;
    get<T>(key: ETagKey): CachedETagData<T> | undefined;
    set<T>(key: ETagKey, payload: HttpResponse<T>, etag: string | undefined): void;
    getETag(key: ETagKey): string | undefined;
    private createKey;
}
export {};
//# sourceMappingURL=ETagCache.d.ts.map