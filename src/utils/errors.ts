// src/utils/errors.ts

export class SDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// OAuth errors
export class OAuthError extends SDKError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'OAUTH_ERROR', details);
  }
}

export class OAuthConfigError extends OAuthError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'OAUTH_CONFIG_ERROR';
  }
}

export class OAuthDeniedError extends OAuthError {
  constructor(message: string = 'User denied authorization', details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'OAUTH_DENIED';
  }
}

// Token errors
export class TokenError extends SDKError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TOKEN_ERROR', details);
  }
}

export class TokenExpiredError extends TokenError {
  constructor(message: string = 'Token expired', details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'TOKEN_EXPIRED';
  }
}

export class TokenRefreshError extends TokenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'TOKEN_REFRESH_FAILED';
  }
}

export class TokenNotFoundError extends TokenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'TOKEN_NOT_FOUND';
  }
}

// API errors
export class ApiError extends SDKError {
  constructor(
    message: string,
    public status: number,
    details?: Record<string, unknown>
  ) {
    super(message, 'API_ERROR', { ...details, status });
  }
}

export class ApiClientError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, (details?.status as number) ?? 400, details);
    this.code = 'API_CLIENT_ERROR';
  }
}

export class ApiServerError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, (details?.status as number) ?? 500, details);
    this.code = 'API_SERVER_ERROR';
  }
}

export class RateLimitError extends ApiError {
  constructor(
    message: string = 'Rate limit exceeded',
    public retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super(message, 429, { ...details, retryAfter });
    this.code = 'RATE_LIMIT_EXCEEDED';
  }
}

// Network errors
export class NetworkError extends SDKError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', details);
  }
}

export class NetworkTimeoutError extends NetworkError {
  constructor(message: string = 'Request timeout', details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'NETWORK_TIMEOUT';
  }
}

export class CircuitBreakerOpenError extends NetworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.code = 'CIRCUIT_BREAKER_OPEN';
  }
}
