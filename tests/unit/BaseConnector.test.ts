/**
 * BaseConnector Unit Tests
 *
 * Tests the base connector functionality including disconnect with expired tokens,
 * token refresh with deduplication, error handling, and metrics recording.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseConnector } from '../../src/connectors/BaseConnector';
import { TokenNotFoundError, TokenExpiredError, TokenRefreshError } from '../../src/utils/errors';
import type { CoreDeps } from '../../src/connectors/types';
import type { ProviderName, NormalizedItem } from '../../src/core/normalizer/types';
import type { TokenSet } from '../../src/core/token/types';

// Create a concrete test implementation of BaseConnector
class TestConnector extends BaseConnector {
  readonly name: ProviderName = 'github';

  protected getRedirectUri(): string {
    return 'http://localhost:3000/callback/github';
  }

  async fetch(_userId: string, _params?: any): Promise<NormalizedItem[]> {
    return [];
  }

  // Expose protected methods for testing
  async testGetAccessToken(userId: string): Promise<string> {
    return this.getAccessToken(userId);
  }
}

describe('BaseConnector', () => {
  let connector: TestConnector;
  let mockDeps: CoreDeps;

  beforeEach(() => {
    mockDeps = {
      auth: {
        createAuthUrl: vi.fn(),
        exchangeCode: vi.fn(),
        refreshToken: vi.fn(),
        revokeToken: vi.fn(),
      } as any,
      tokens: {
        getToken: vi.fn(),
        setToken: vi.fn(),
        updateToken: vi.fn(),
        deleteToken: vi.fn(),
      } as any,
      http: {} as any,
      normalizer: {} as any,
      metrics: {
        incrementCounter: vi.fn(),
        recordLatency: vi.fn(),
      } as any,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      } as any,
      refreshLock: {
        tryAcquire: vi.fn(),
        waitForRelease: vi.fn(),
        release: vi.fn(),
      } as any,
    };

    connector = new TestConnector(mockDeps);
  });

  describe('disconnect', () => {
    it('should handle disconnect with valid (non-expired) token', async () => {
      const validToken: TokenSet = {
        accessToken: 'valid-access-token',
        tokenType: 'bearer',
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // Expires in 1 hour
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(validToken);
      vi.mocked(mockDeps.auth.revokeToken).mockResolvedValue(undefined);

      await connector.disconnect('user-123');

      // Should get token with includeExpired flag
      expect(mockDeps.tokens.getToken).toHaveBeenCalledWith('user-123', 'github', {
        includeExpired: true,
      });

      // Should attempt to revoke the non-expired token
      expect(mockDeps.auth.revokeToken).toHaveBeenCalledWith('github', 'valid-access-token');

      // Should delete token from storage
      expect(mockDeps.tokens.deleteToken).toHaveBeenCalledWith('user-123', 'github');

      // Should log disconnection
      expect(mockDeps.logger.info).toHaveBeenCalledWith('Disconnected', {
        provider: 'github',
        userId: 'user-123',
      });
    });

    it('should handle disconnect with expired token', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        tokenType: 'bearer',
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(expiredToken);

      await connector.disconnect('user-123');

      // Should get token with includeExpired flag
      expect(mockDeps.tokens.getToken).toHaveBeenCalledWith('user-123', 'github', {
        includeExpired: true,
      });

      // Should NOT attempt to revoke expired token
      expect(mockDeps.auth.revokeToken).not.toHaveBeenCalled();

      // Should still delete token from storage
      expect(mockDeps.tokens.deleteToken).toHaveBeenCalledWith('user-123', 'github');

      // Should log disconnection
      expect(mockDeps.logger.info).toHaveBeenCalledWith('Disconnected', {
        provider: 'github',
        userId: 'user-123',
      });
    });

    it('should handle disconnect when no token exists', async () => {
      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(null);

      await connector.disconnect('user-123');

      // Should get token with includeExpired flag
      expect(mockDeps.tokens.getToken).toHaveBeenCalledWith('user-123', 'github', {
        includeExpired: true,
      });

      // Should NOT attempt to revoke or delete
      expect(mockDeps.auth.revokeToken).not.toHaveBeenCalled();
      expect(mockDeps.tokens.deleteToken).not.toHaveBeenCalled();

      // Should still log disconnection
      expect(mockDeps.logger.info).toHaveBeenCalledWith('Disconnected', {
        provider: 'github',
        userId: 'user-123',
      });
    });

    it('should handle revocation failure gracefully', async () => {
      const validToken: TokenSet = {
        accessToken: 'valid-access-token',
        tokenType: 'bearer',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(validToken);
      vi.mocked(mockDeps.auth.revokeToken).mockRejectedValue(new Error('Revocation failed'));

      await connector.disconnect('user-123');

      // Should attempt revocation
      expect(mockDeps.auth.revokeToken).toHaveBeenCalled();

      // Should log warning about failure
      expect(mockDeps.logger.warn).toHaveBeenCalledWith('Token revocation failed', {
        provider: 'github',
        userId: 'user-123',
        error: 'Revocation failed',
      });

      // Should still delete token from storage despite revocation failure
      expect(mockDeps.tokens.deleteToken).toHaveBeenCalledWith('user-123', 'github');

      // Should still log disconnection
      expect(mockDeps.logger.info).toHaveBeenCalledWith('Disconnected', {
        provider: 'github',
        userId: 'user-123',
      });
    });

    it('should handle token without expiry (no expiresAt field)', async () => {
      const tokenWithoutExpiry: TokenSet = {
        accessToken: 'token-no-expiry',
        tokenType: 'bearer',
        // No expiresAt field
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(tokenWithoutExpiry);

      await connector.disconnect('user-123');

      // Should NOT attempt revocation (no expiry means we can't determine if valid)
      expect(mockDeps.auth.revokeToken).not.toHaveBeenCalled();

      // Should still delete token
      expect(mockDeps.tokens.deleteToken).toHaveBeenCalledWith('user-123', 'github');
    });
  });

  describe('connect', () => {
    it('should create auth URL with default options', async () => {
      const authUrl =
        'https://github.com/login/oauth/authorize?client_id=test&redirect_uri=callback';
      vi.mocked(mockDeps.auth.createAuthUrl).mockReturnValue(authUrl);

      const result = await connector.connect('user-123');

      expect(mockDeps.auth.createAuthUrl).toHaveBeenCalledWith('github', 'user-123', undefined);
      expect(mockDeps.logger.info).toHaveBeenCalledWith('Connect initiated', {
        provider: 'github',
        userId: 'user-123',
      });
      expect(result).toBe(authUrl);
    });

    it('should create auth URL with custom options', async () => {
      const authUrl =
        'https://github.com/login/oauth/authorize?client_id=test&redirect_uri=callback';
      const customOpts = { scope: 'user:email,repo' };
      vi.mocked(mockDeps.auth.createAuthUrl).mockReturnValue(authUrl);

      const result = await connector.connect('user-123', customOpts);

      expect(mockDeps.auth.createAuthUrl).toHaveBeenCalledWith('github', 'user-123', customOpts);
      expect(result).toBe(authUrl);
    });
  });

  describe('handleCallback', () => {
    it('should handle successful OAuth callback', async () => {
      const tokenSet: TokenSet = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
        scope: 'user:email',
      };

      vi.mocked(mockDeps.auth.exchangeCode).mockResolvedValue(tokenSet);
      vi.mocked(mockDeps.tokens.setToken).mockResolvedValue(undefined);

      const params = new URLSearchParams('code=abc123&state=xyz789');
      const result = await connector.handleCallback('user-123', params);

      expect(mockDeps.auth.exchangeCode).toHaveBeenCalledWith(
        'github',
        'abc123',
        'xyz789',
        'http://localhost:3000/callback/github'
      );
      expect(mockDeps.tokens.setToken).toHaveBeenCalledWith('user-123', 'github', tokenSet);
      expect(mockDeps.metrics.incrementCounter).toHaveBeenCalledWith('connections_total', {
        provider: 'github',
      });
      expect(result).toBe(tokenSet);
    });

    it('should throw error for missing code parameter', async () => {
      const params = new URLSearchParams('state=xyz789');

      await expect(connector.handleCallback('user-123', params)).rejects.toThrow(
        'Missing code or state parameter'
      );
    });

    it('should throw error for missing state parameter', async () => {
      const params = new URLSearchParams('code=abc123');

      await expect(connector.handleCallback('user-123', params)).rejects.toThrow(
        'Missing code or state parameter'
      );
    });
  });

  describe('getAccessToken', () => {
    it('should return access token when token is valid', async () => {
      const validToken: TokenSet = {
        accessToken: 'valid-access-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(validToken);

      const result = await connector.testGetAccessToken('user-123');

      expect(mockDeps.tokens.getToken).toHaveBeenCalledWith('user-123', 'github', {
        includeExpired: true,
      });
      expect(result).toBe('valid-access-token');
    });

    it('should throw error when no token found', async () => {
      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(null);

      await expect(connector.testGetAccessToken('user-123')).rejects.toThrow(TokenNotFoundError);
      expect(mockDeps.tokens.getToken).toHaveBeenCalledWith('user-123', 'github', {
        includeExpired: true,
      });
    });

    it('should refresh token when expired', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        tokenType: 'Bearer',
      };

      const newToken: TokenSet = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      vi.mocked(mockDeps.tokens.getToken)
        .mockResolvedValueOnce(expiredToken) // First call for expired token
        .mockResolvedValueOnce(newToken); // Second call after refresh

      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(true);
      vi.mocked(mockDeps.auth.refreshToken).mockResolvedValue(newToken);
      vi.mocked(mockDeps.tokens.updateToken).mockResolvedValue(undefined);
      vi.mocked(mockDeps.refreshLock.release).mockResolvedValue(undefined);

      const result = await connector.testGetAccessToken('user-123');

      expect(mockDeps.logger.info).toHaveBeenCalledWith('Auto-refreshing token', {
        provider: 'github',
        userId: 'user-123',
        expiresAt: expiredToken.expiresAt?.toISOString(),
        expired: true,
      });
      expect(mockDeps.auth.refreshToken).toHaveBeenCalledWith('github', 'valid-refresh-token');
      expect(mockDeps.tokens.updateToken).toHaveBeenCalledWith('user-123', 'github', newToken);
      expect(result).toBe('new-access-token');
    });

    it('should handle distributed lock acquisition failure', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      const refreshedToken: TokenSet = {
        accessToken: 'refreshed-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      vi.mocked(mockDeps.tokens.getToken)
        .mockResolvedValueOnce(expiredToken) // First call for expired token
        .mockResolvedValueOnce(refreshedToken); // Second call after waiting

      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(false);
      vi.mocked(mockDeps.refreshLock.waitForRelease).mockResolvedValue(undefined);

      const result = await connector.testGetAccessToken('user-123');

      expect(mockDeps.logger.debug).toHaveBeenCalledWith('Another instance refreshing, waiting', {
        provider: 'github',
        userId: 'user-123',
      });
      expect(mockDeps.metrics.incrementCounter).toHaveBeenCalledWith(
        'token_refresh_dedup_distributed',
        { provider: 'github' }
      );
      expect(mockDeps.refreshLock.waitForRelease).toHaveBeenCalledWith('user-123', 'github');
      expect(result).toBe('refreshed-access-token');
    });

    it('should handle refresh failure with invalid_grant error', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'invalid-refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(expiredToken);
      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(true);
      vi.mocked(mockDeps.auth.refreshToken).mockRejectedValue(
        new Error('invalid_grant: The provided authorization grant is invalid')
      );
      vi.mocked(mockDeps.tokens.deleteToken).mockResolvedValue(undefined);
      vi.mocked(mockDeps.refreshLock.release).mockResolvedValue(undefined);

      await expect(connector.testGetAccessToken('user-123')).rejects.toThrow(TokenExpiredError);

      expect(mockDeps.tokens.deleteToken).toHaveBeenCalledWith('user-123', 'github');
      expect(mockDeps.metrics.incrementCounter).toHaveBeenCalledWith('token_refresh_failures', {
        provider: 'github',
        errorType: 'unknown',
      });
      expect(mockDeps.metrics.incrementCounter).toHaveBeenCalledWith('token_refresh_total', {
        provider: 'github',
        status: 'failed',
      });
    });

    it('should handle refresh failure with other errors', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      const networkError = new Error('Network timeout');
      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(expiredToken);
      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(true);
      vi.mocked(mockDeps.auth.refreshToken).mockRejectedValue(networkError);
      vi.mocked(mockDeps.refreshLock.release).mockResolvedValue(undefined);

      await expect(connector.testGetAccessToken('user-123')).rejects.toThrow('Network timeout');

      expect(mockDeps.logger.error).toHaveBeenCalledWith('Token refresh failed', {
        provider: 'github',
        userId: 'user-123',
        error: 'Network timeout',
      });
      expect(mockDeps.metrics.incrementCounter).toHaveBeenCalledWith('token_refresh_failures', {
        provider: 'github',
        errorType: 'unknown',
      });
    });

    it('should handle refresh failure with error code', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      const errorWithCode = new Error('Rate limit exceeded');
      (errorWithCode as any).code = 'RATE_LIMIT';

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(expiredToken);
      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(true);
      vi.mocked(mockDeps.auth.refreshToken).mockRejectedValue(errorWithCode);
      vi.mocked(mockDeps.refreshLock.release).mockResolvedValue(undefined);

      await expect(connector.testGetAccessToken('user-123')).rejects.toThrow('Rate limit exceeded');

      expect(mockDeps.metrics.incrementCounter).toHaveBeenCalledWith('token_refresh_failures', {
        provider: 'github',
        errorType: 'RATE_LIMIT',
      });
    });

    it('should handle refresh failure when waiting for release fails', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(expiredToken);
      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(false);
      vi.mocked(mockDeps.refreshLock.waitForRelease).mockResolvedValue(undefined);
      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(null); // No token after waiting

      await expect(connector.testGetAccessToken('user-123')).rejects.toThrow(TokenRefreshError);
    });

    it('should handle local deduplication when refresh is already in progress', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      const newToken: TokenSet = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      // Mock the refresh promise to simulate in-progress refresh
      const refreshPromise = Promise.resolve(newToken);
      (connector as any).refreshLocks.set('user-123:github', refreshPromise);

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(expiredToken);
      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(true);

      const result = await connector.testGetAccessToken('user-123');

      expect(mockDeps.metrics.incrementCounter).toHaveBeenCalledWith('token_refresh_dedup_local', {
        provider: 'github',
      });
      expect(mockDeps.logger.debug).toHaveBeenCalledWith('Refresh already in progress, waiting', {
        provider: 'github',
        userId: 'user-123',
      });
      expect(result).toBe('new-access-token');
    });

    it('should record metrics for successful refresh', async () => {
      const expiredToken: TokenSet = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 60000),
        tokenType: 'Bearer',
      };

      const newToken: TokenSet = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      vi.mocked(mockDeps.tokens.getToken)
        .mockResolvedValueOnce(expiredToken)
        .mockResolvedValueOnce(newToken);

      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(true);
      vi.mocked(mockDeps.auth.refreshToken).mockResolvedValue(newToken);
      vi.mocked(mockDeps.tokens.updateToken).mockResolvedValue(undefined);
      vi.mocked(mockDeps.refreshLock.release).mockResolvedValue(undefined);

      // Mock Date.now to control timing
      const startTime = 1000;
      const endTime = 1500;
      vi.spyOn(Date, 'now').mockReturnValueOnce(startTime).mockReturnValueOnce(endTime);

      await connector.testGetAccessToken('user-123');

      expect(mockDeps.metrics.recordLatency).toHaveBeenCalledWith('token_refresh_duration', 500, {
        provider: 'github',
        status: 'success',
      });
      expect(mockDeps.metrics.incrementCounter).toHaveBeenCalledWith('token_refresh_total', {
        provider: 'github',
        status: 'success',
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle token without refresh token', async () => {
      const tokenWithoutRefresh: TokenSet = {
        accessToken: 'access-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() - 60000), // Expired but no refresh token
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(tokenWithoutRefresh);

      const result = await connector.testGetAccessToken('user-123');

      // Should return the expired token without attempting refresh
      expect(result).toBe('access-token');
      expect(mockDeps.auth.refreshToken).not.toHaveBeenCalled();
    });

    it('should handle token without expiry date', async () => {
      const tokenWithoutExpiry: TokenSet = {
        accessToken: 'access-token',
        tokenType: 'Bearer',
        // No expiresAt field
      };

      vi.mocked(mockDeps.tokens.getToken).mockResolvedValue(tokenWithoutExpiry);

      const result = await connector.testGetAccessToken('user-123');

      // Should return the token without attempting refresh
      expect(result).toBe('access-token');
      expect(mockDeps.auth.refreshToken).not.toHaveBeenCalled();
    });

    it('should handle token that expires exactly at the margin', async () => {
      const marginTime = 5 * 60 * 1000; // 5 minutes
      const tokenAtMargin: TokenSet = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + marginTime), // Exactly at margin
        tokenType: 'Bearer',
      };

      const newToken: TokenSet = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        tokenType: 'Bearer',
      };

      vi.mocked(mockDeps.tokens.getToken)
        .mockResolvedValueOnce(tokenAtMargin)
        .mockResolvedValueOnce(newToken);

      vi.mocked(mockDeps.refreshLock.tryAcquire).mockResolvedValue(true);
      vi.mocked(mockDeps.auth.refreshToken).mockResolvedValue(newToken);
      vi.mocked(mockDeps.tokens.updateToken).mockResolvedValue(undefined);
      vi.mocked(mockDeps.refreshLock.release).mockResolvedValue(undefined);

      const result = await connector.testGetAccessToken('user-123');

      // Should trigger refresh because it's at the margin
      expect(mockDeps.auth.refreshToken).toHaveBeenCalled();
      expect(result).toBe('new-access-token');
    });
  });
});
