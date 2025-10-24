// src/core/normalizer/Normalizer.ts

import { z } from 'zod';
import type { NormalizedItem, ProviderName } from './types';
import { ProviderMappers } from './ProviderMappers';

// Validation schema (exported for JSON Schema generation)
export const NormalizedItemSchema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  externalId: z.string(),
  userId: z.string(),
  title: z.string().optional(),
  bodyText: z.string().optional(),
  url: z.string().url().optional(),
  author: z.string().optional(),
  publishedAt: z.string().datetime().optional(), // ISO 8601 validation
  metadata: z.record(z.unknown()).optional(),
});

export class Normalizer {
  private mappers: ProviderMappers;

  constructor() {
    this.mappers = new ProviderMappers();
  }

  /**
   * Normalize provider-specific data
   * Accepts both official providers and internal service keys (e.g. 'google-calendar')
   */
  normalize(provider: ProviderName | string, userId: string, rawData: unknown[]): NormalizedItem[] {
    const mapper = this.mappers.get(provider);
    if (!mapper) {
      throw new Error(`No mapper found for provider: ${provider}`);
    }

    return rawData.map((item) => {
      const normalized = mapper(item, userId);

      // Validate schema
      try {
        NormalizedItemSchema.parse(normalized);
      } catch (error) {
        throw new Error(`Schema validation failed for ${provider}: ${error}`);
      }

      return normalized;
    });
  }
}
