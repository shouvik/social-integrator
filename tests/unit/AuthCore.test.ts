// tests/unit/AuthCore.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthCore } from '../../src/core/auth/AuthCore';
import { TokenRefreshError, OAuthConfigError } from '../../src/utils/errors';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
} as any;

describe('AuthCore', () => {
  let authCore: AuthCore;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    authCore = new AuthCore({
      github: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        scopes: ['user', 'repo'],
        redirectUri: 'http://localhost:3000/callback',
        usePKCE: true
      }
    }, mockLogger);
  });
  
  it('should generate PKCE challenge in auth URL', async () => {
    await authCore.initialize();
    
    const authUrl = authCore.createAuthUrl('github', 'user123');
    
    expect(authUrl).toContain('code_challenge=');
    expect(authUrl).toContain('code_challenge_method=S256');
    expect(authUrl).toContain('state=');
    expect(authUrl).toContain('nonce=');
    expect(authUrl).toContain('scope=');
  });
  
  it('should throw OAuthConfigError for unconfigured provider', async () => {
    await authCore.initialize();
    
    expect(() => {
      authCore.createAuthUrl('google' as any, 'user123');
    }).toThrow(OAuthConfigError);
  });
  
  it('should cleanup expired PKCE challenges', async () => {
    await authCore.initialize();
    
    // Generate auth URL (creates PKCE challenge)
    const authUrl1 = authCore.createAuthUrl('github', 'user1');
    const authUrl2 = authCore.createAuthUrl('github', 'user2');
    
    // Extract states
    const state1 = new URL(authUrl1).searchParams.get('state')!;
    const state2 = new URL(authUrl2).searchParams.get('state')!;
    
    // Verify challenges exist
    expect(authCore['pkceStore'].has(state1)).toBe(true);
    expect(authCore['pkceStore'].has(state2)).toBe(true);
    
    // Manually expire one challenge
    const challenge1 = authCore['pkceStore'].get(state1)!;
    challenge1.createdAt = Date.now() - 700000; // 11.5 minutes ago
    
    // Trigger cleanup
    authCore['cleanupExpiredChallenges']();
    
    // Expired challenge should be removed
    expect(authCore['pkceStore'].has(state1)).toBe(false);
    // Non-expired should remain
    expect(authCore['pkceStore'].has(state2)).toBe(true);
  });
  
  it('should throw TokenRefreshError on refresh failure (Bug #2 fix)', async () => {
    await authCore.initialize();
    
    // Create a mock client that will fail
    const mockClient = {
      refresh: vi.fn().mockRejectedValue(new Error('invalid_grant'))
    };
    
    authCore['oauth2Clients'].set('github', mockClient as any);
    
    // Should throw TokenRefreshError, not raw error
    await expect(authCore.refreshToken('github', 'bad_token'))
      .rejects.toThrow(TokenRefreshError);
    
    await expect(authCore.refreshToken('github', 'bad_token'))
      .rejects.toThrow('Failed to refresh token');
  });
  
  it('should include provider context in TokenRefreshError', async () => {
    await authCore.initialize();
    
    const mockClient = {
      refresh: vi.fn().mockRejectedValue(new Error('invalid_grant'))
    };
    
    authCore['oauth2Clients'].set('github', mockClient as any);
    
    try {
      await authCore.refreshToken('github', 'bad_token');
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error).toBeInstanceOf(TokenRefreshError);
      expect(error.details).toHaveProperty('provider', 'github');
      expect(error.details).toHaveProperty('cause');
    }
  });
  
  it('should throw error for expired PKCE challenge', async () => {
    await authCore.initialize();
    
    const authUrl = authCore.createAuthUrl('github', 'user123');
    const state = new URL(authUrl).searchParams.get('state')!;
    
    // Manually expire the challenge
    const challenge = authCore['pkceStore'].get(state)!;
    challenge.createdAt = Date.now() - 700000; // 11.5 minutes ago
    
    await expect(
      authCore.exchangeCode('github', 'test-code', state, 'http://localhost:3000/callback')
    ).rejects.toThrow('PKCE challenge expired');
  });
});

