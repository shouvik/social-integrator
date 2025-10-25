export interface NormalizedItem {
    id: string;
    source: string;
    externalId: string;
    userId: string;
    title?: string;
    bodyText?: string;
    url?: string;
    author?: string;
    publishedAt?: string;
    metadata?: Record<string, unknown>;
}
export type ProviderName = 'google' | 'github' | 'reddit' | 'twitter' | 'x' | 'rss';
//# sourceMappingURL=types.d.ts.map