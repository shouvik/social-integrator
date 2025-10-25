/**
 * Error Classes Unit Tests
 *
 * Tests all custom error classes and their constructors to ensure
 * proper error handling and branch coverage.
 */

import { describe, it, expect } from 'vitest';
import {
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
  CircuitBreakerOpenError,
} from '../../src/utils/errors';

describe('Error Classes', () => {
  describe('SDKError', () => {
    it('should create error with message and code', () => {
      const error = new SDKError('Test error', 'TEST_CODE');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toBeUndefined();
    });

    it('should create error with details', () => {
      const details = { userId: 'user-123', provider: 'google' };
      const error = new SDKError('Test error', 'TEST_CODE', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('OAuthConfigError', () => {
    it('should create error with default code', () => {
      const error = new OAuthConfigError('Invalid OAuth config');
      expect(error.message).toBe('Invalid OAuth config');
      expect(error.code).toBe('OAUTH_CONFIG_ERROR');
    });

    it('should create error with details', () => {
      const details = { field: 'clientId' };
      const error = new OAuthConfigError('Missing clientId', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('OAuthDeniedError', () => {
    it('should create error with default message', () => {
      const error = new OAuthDeniedError();
      expect(error.message).toBe('User denied authorization');
      expect(error.code).toBe('OAUTH_DENIED');
    });

    it('should create error with custom message', () => {
      const error = new OAuthDeniedError('Authorization declined');
      expect(error.message).toBe('Authorization declined');
      expect(error.code).toBe('OAUTH_DENIED');
    });

    it('should create error with details', () => {
      const details = { provider: 'google' };
      const error = new OAuthDeniedError('User cancelled', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('OAuthError', () => {
    it('should create error with default code', () => {
      const error = new OAuthError('OAuth failed');
      expect(error.message).toBe('OAuth failed');
      expect(error.code).toBe('OAUTH_ERROR');
    });

    it('should create error with details', () => {
      const details = { provider: 'twitter', error: 'access_denied' };
      const error = new OAuthError('Authorization denied', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('TokenError', () => {
    it('should create error with default code', () => {
      const error = new TokenError('Token error');
      expect(error.message).toBe('Token error');
      expect(error.code).toBe('TOKEN_ERROR');
    });

    it('should create error with details', () => {
      const details = { userId: 'user-123' };
      const error = new TokenError('Invalid token', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('TokenExpiredError', () => {
    it('should create error with default message', () => {
      const error = new TokenExpiredError();
      expect(error.message).toBe('Token expired');
      expect(error.code).toBe('TOKEN_EXPIRED');
    });

    it('should create error with custom message', () => {
      const error = new TokenExpiredError('Access token has expired');
      expect(error.message).toBe('Access token has expired');
    });

    it('should create error with details', () => {
      const details = { expiresAt: '2025-01-01T00:00:00Z' };
      const error = new TokenExpiredError('Expired', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('TokenNotFoundError', () => {
    it('should create error with message', () => {
      const error = new TokenNotFoundError('Token not found');
      expect(error.message).toBe('Token not found');
      expect(error.code).toBe('TOKEN_NOT_FOUND');
    });

    it('should create error with details', () => {
      const details = { userId: 'user-123', provider: 'github' };
      const error = new TokenNotFoundError('No token for user', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('TokenRefreshError', () => {
    it('should create error with default code', () => {
      const error = new TokenRefreshError('Refresh failed');
      expect(error.message).toBe('Refresh failed');
      expect(error.code).toBe('TOKEN_REFRESH_FAILED');
    });

    it('should create error with details', () => {
      const details = { provider: 'github', statusCode: 401 };
      const error = new TokenRefreshError('Unauthorized', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('ApiError', () => {
    it('should create error with status code', () => {
      const error = new ApiError('API error', 418);
      expect(error.message).toBe('API error');
      expect(error.code).toBe('API_ERROR');
      expect(error.status).toBe(418);
    });

    it('should create error with details', () => {
      const details = { endpoint: '/api/users' };
      const error = new ApiError('Request failed', 500, details);
      expect(error.status).toBe(500);
      expect(error.details).toMatchObject(details);
    });
  });

  describe('ApiClientError', () => {
    it('should create error with default status code', () => {
      const error = new ApiClientError('Bad request');
      expect(error.message).toBe('Bad request');
      expect(error.code).toBe('API_CLIENT_ERROR');
      expect(error.status).toBe(400);
    });

    it('should create error with custom status code in details', () => {
      const details = { status: 422, field: 'email' };
      const error = new ApiClientError('Validation failed', details);
      expect(error.status).toBe(422);
      expect(error.details).toMatchObject(details);
    });

    it('should create error without details', () => {
      const error = new ApiClientError('Not found');
      expect(error.status).toBe(400);
    });
  });

  describe('ApiServerError', () => {
    it('should create error with default status code', () => {
      const error = new ApiServerError('Internal server error');
      expect(error.message).toBe('Internal server error');
      expect(error.code).toBe('API_SERVER_ERROR');
      expect(error.status).toBe(500);
    });

    it('should create error with custom status code in details', () => {
      const details = { status: 503, service: 'database' };
      const error = new ApiServerError('Service unavailable', details);
      expect(error.status).toBe(503);
      expect(error.details).toMatchObject(details);
    });
  });

  describe('RateLimitError', () => {
    it('should create error with default message and status code', () => {
      const error = new RateLimitError();
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.status).toBe(429);
    });

    it('should create error with custom message', () => {
      const error = new RateLimitError('Too many requests');
      expect(error.message).toBe('Too many requests');
      expect(error.status).toBe(429);
    });

    it('should create error with retryAfter', () => {
      const error = new RateLimitError('Rate limited', 60);
      expect(error.retryAfter).toBe(60);
      expect(error.details).toMatchObject({ retryAfter: 60 });
    });

    it('should create error with details', () => {
      const details = { limit: 100, remaining: 0 };
      const error = new RateLimitError('Exceeded limit', 30, details);
      expect(error.retryAfter).toBe(30);
      expect(error.details).toMatchObject({ ...details, retryAfter: 30 });
    });
  });

  describe('NetworkError', () => {
    it('should create error with default code', () => {
      const error = new NetworkError('Network failed');
      expect(error.message).toBe('Network failed');
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('should create error with details', () => {
      const details = { host: 'api.example.com', errno: 'ECONNREFUSED' };
      const error = new NetworkError('Connection refused', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('NetworkTimeoutError', () => {
    it('should create error with default message', () => {
      const error = new NetworkTimeoutError();
      expect(error.message).toBe('Request timeout');
      expect(error.code).toBe('NETWORK_TIMEOUT');
    });

    it('should create error with custom message', () => {
      const error = new NetworkTimeoutError('Connection timed out after 30s');
      expect(error.message).toBe('Connection timed out after 30s');
      expect(error.code).toBe('NETWORK_TIMEOUT');
    });

    it('should create error with details', () => {
      const details = { timeout: 30000, url: 'https://api.example.com' };
      const error = new NetworkTimeoutError('Timeout', details);
      expect(error.details).toEqual(details);
      expect(error.code).toBe('NETWORK_TIMEOUT');
    });

    it('should create error with custom message and details', () => {
      const details = { timeout: 60000 };
      const error = new NetworkTimeoutError('Custom timeout message', details);
      expect(error.message).toBe('Custom timeout message');
      expect(error.details).toEqual(details);
      expect(error.code).toBe('NETWORK_TIMEOUT');
    });
  });

  describe('CircuitBreakerOpenError', () => {
    it('should create error with message', () => {
      const error = new CircuitBreakerOpenError('Circuit breaker is open');
      expect(error.message).toBe('Circuit breaker is open');
      expect(error.code).toBe('CIRCUIT_BREAKER_OPEN');
    });

    it('should create error with details', () => {
      const details = { failures: 5, threshold: 3, provider: 'github' };
      const error = new CircuitBreakerOpenError('Too many failures', details);
      expect(error.message).toBe('Too many failures');
      expect(error.details).toEqual(details);
      expect(error.code).toBe('CIRCUIT_BREAKER_OPEN');
    });

    it('should inherit from NetworkError', () => {
      const error = new CircuitBreakerOpenError('Circuit open');
      expect(error).toBeInstanceOf(NetworkError);
      expect(error).toBeInstanceOf(SDKError);
    });
  });

  describe('Error hierarchy', () => {
    it('should maintain proper inheritance chain', () => {
      const oauthError = new OAuthError('OAuth error');
      expect(oauthError).toBeInstanceOf(SDKError);
      expect(oauthError).toBeInstanceOf(Error);

      const oauthConfigError = new OAuthConfigError('Config error');
      expect(oauthConfigError).toBeInstanceOf(OAuthError);
      expect(oauthConfigError).toBeInstanceOf(SDKError);

      const tokenError = new TokenError('Token error');
      expect(tokenError).toBeInstanceOf(SDKError);

      const tokenExpiredError = new TokenExpiredError();
      expect(tokenExpiredError).toBeInstanceOf(TokenError);
      expect(tokenExpiredError).toBeInstanceOf(SDKError);

      const apiClientError = new ApiClientError('Client error');
      expect(apiClientError).toBeInstanceOf(ApiError);
      expect(apiClientError).toBeInstanceOf(SDKError);

      const apiServerError = new ApiServerError('Server error');
      expect(apiServerError).toBeInstanceOf(ApiError);
      expect(apiServerError).toBeInstanceOf(SDKError);

      const rateLimitError = new RateLimitError();
      expect(rateLimitError).toBeInstanceOf(ApiError);
      expect(rateLimitError).toBeInstanceOf(SDKError);

      const timeoutError = new NetworkTimeoutError();
      expect(timeoutError).toBeInstanceOf(NetworkError);
      expect(timeoutError).toBeInstanceOf(SDKError);

      const circuitError = new CircuitBreakerOpenError('Circuit open');
      expect(circuitError).toBeInstanceOf(NetworkError);
      expect(circuitError).toBeInstanceOf(SDKError);
    });
  });
});
