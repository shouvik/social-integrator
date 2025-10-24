// src/index.ts

export { ConnectorSDK } from './sdk';
export type { InitConfig } from './sdk';
export type { ProviderName, NormalizedItem } from './core/normalizer/types';
export type { TokenSet } from './core/token/types';
export type { FetchParams } from './connectors/types';
export type { ConnectOptions } from './core/auth/types';

// Export error classes for error handling
export {
  SDKError,
  OAuthError,
  OAuthConfigError,
  OAuthDeniedError,
  TokenError,
  TokenExpiredError,
  TokenRefreshError,
  TokenNotFoundError,
  ApiError,
  ApiClientError,
  ApiServerError,
  RateLimitError,
  NetworkError,
  NetworkTimeoutError,
  CircuitBreakerOpenError
} from './utils/errors';

