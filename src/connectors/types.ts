// src/connectors/types.ts

import type { ProviderName, NormalizedItem } from '../core/normalizer/types';
import type { TokenSet } from '../core/token/types';
import type { ConnectOptions } from '../core/auth/types';
import type { AuthCore } from '../core/auth/AuthCore';
import type { HttpCore } from '../core/http/HttpCore';
import type { TokenStore } from '../core/token/TokenStore';
import type { Normalizer } from '../core/normalizer/Normalizer';
import type { Logger } from '../observability/Logger';
import type { MetricsCollector } from '../observability/MetricsCollector';
import type { DistributedRefreshLock } from '../core/token/DistributedRefreshLock';

export interface Connector {
  readonly name: ProviderName;
  
  connect(userId: string, opts?: ConnectOptions): Promise<string>;
  handleCallback(userId: string, params: URLSearchParams): Promise<TokenSet>;
  fetch(userId: string, params?: FetchParams): Promise<NormalizedItem[]>;
  disconnect(userId: string): Promise<void>;
}

export interface FetchParams {
  limit?: number;
  offset?: number;
  since?: Date;
  type?: string;                       // Provider-specific (e.g., 'starred', 'repos')
  [key: string]: unknown;              // Allow provider-specific params
}

export interface CoreDeps {
  auth: AuthCore;
  http: HttpCore;
  tokens: TokenStore;
  normalizer: Normalizer;
  logger: Logger;
  metrics: MetricsCollector;
  refreshLock: DistributedRefreshLock;
}

