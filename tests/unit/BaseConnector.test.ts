/**
 * BaseConnector Unit Tests
 *
 * Tests the base connector functionality including disconnect with expired tokens.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseConnector } from '../../src/connectors/BaseConnector';
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
        deleteToken: vi.fn(),
      } as any,
      http: {} as any,
      normalizer: {} as any,
      metrics: {
        incrementCounter: vi.fn(),
      } as any,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
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
});
