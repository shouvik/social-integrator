import { z } from 'zod';
import type { NormalizedItem, ProviderName } from './types';
export declare const NormalizedItemSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    externalId: z.ZodString;
    userId: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    bodyText: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    publishedAt: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    id: string;
    source: string;
    externalId: string;
    url?: string | undefined;
    title?: string | undefined;
    bodyText?: string | undefined;
    author?: string | undefined;
    publishedAt?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    userId: string;
    id: string;
    source: string;
    externalId: string;
    url?: string | undefined;
    title?: string | undefined;
    bodyText?: string | undefined;
    author?: string | undefined;
    publishedAt?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare class Normalizer {
    private mappers;
    constructor();
    /**
     * Normalize provider-specific data
     * Accepts both official providers and internal service keys (e.g. 'google-calendar')
     */
    normalize(provider: ProviderName | string, userId: string, rawData: unknown[]): NormalizedItem[];
}
//# sourceMappingURL=Normalizer.d.ts.map