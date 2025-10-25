// src/core/normalizer/types.ts

export interface NormalizedItem {
  id: string; // Internal UUID
  source: string; // 'google', 'github', etc.
  externalId: string; // Provider's ID
  userId: string; // Our user ID
  title?: string;
  bodyText?: string;
  url?: string;
  author?: string;
  publishedAt?: string; // ISO 8601 timestamp
  metadata?: Record<string, unknown>;
}

export type ProviderName = 'google' | 'github' | 'reddit' | 'twitter' | 'x' | 'rss';
