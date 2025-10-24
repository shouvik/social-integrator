/**
 * Contract test: GitHub OAuth flow
 *
 * Tests the complete OAuth 2.0 flow with PKCE for GitHub:
 * 1. connect() → authorization URL
 * 2. handleCallback() → exchange code for tokens
 * 3. fetch() → API request with access token
 * 4. Token refresh when expired
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConnectorSDK } from '../../src/sdk';

describe('GitHub OAuth Flow Contract', () => {
  let sdk: ConnectorSDK;
  const testUserId = 'test-user-123';
  const mockEncryptionKey = '0'.repeat(64); // 32 bytes as hex

  beforeEach(async () => {
    // Initialize SDK with GitHub provider
    sdk = await ConnectorSDK.init({
      tokenStore: {
        backend: 'memory',
        encryption: {
          key: mockEncryptionKey,
          algorithm: 'aes-256-gcm',
        },
      },
      providers: {
        github: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          scopes: ['user', 'repo'],
          redirectUri: 'http://localhost:3000/callback/github',
          usePKCE: true,
        },
      },
      rateLimits: {
        github: { qps: 10, concurrency: 5 },
        google: { qps: 10, concurrency: 5 },
        reddit: { qps: 1, concurrency: 2 },
        twitter: { qps: 5, concurrency: 3 },
        x: { qps: 5, concurrency: 3 },
        rss: { qps: 1, concurrency: 2 },
      },
      http: {
        retry: {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 1000,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
      },
      logging: {
        level: 'error', // Suppress logs in tests
      },
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should generate valid authorization URL with PKCE', async () => {
    const authUrl = await sdk.connect('github', testUserId);

    expect(authUrl).toContain('https://github.com/login/oauth/authorize');
    expect(authUrl).toContain('client_id=test-client-id');
    expect(authUrl).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback%2Fgithub');
    expect(authUrl).toContain('scope=user%20repo');
    expect(authUrl).toContain('code_challenge='); // PKCE
    expect(authUrl).toContain('code_challenge_method=S256');
    expect(authUrl).toContain('state=');
  });

  it('should exchange authorization code for tokens', async () => {
    // Step 1: Generate auth URL (stores code_verifier)
    await sdk.connect('github', testUserId);

    // Step 2: Mock token exchange
    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_test_access_token',
      token_type: 'bearer',
      scope: 'user,repo',
    });

    // Step 3: Handle callback
    const callbackParams = new URLSearchParams({
      code: 'test_auth_code',
      state: 'test_state',
    });

    await sdk.handleCallback('github', testUserId, callbackParams);

    // Verify token was stored by attempting to fetch
    nock('https://api.github.com')
      .get('/user/starred')
      .matchHeader('authorization', 'Bearer gho_test_access_token')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(200, [
        {
          id: 123456,
          name: 'test-repo',
          description: 'Test repository',
          html_url: 'https://github.com/user/test-repo',
          owner: { login: 'user' },
          created_at: '2024-01-15T10:30:00Z',
          stargazers_count: 42,
          language: 'TypeScript',
        },
      ]);

    const items = await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('github');
    expect(items[0].title).toBe('test-repo');
  });

  it('should refresh expired access token automatically', async () => {
    // Step 1: Store expired token
    await sdk.connect('github', testUserId);

    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_old_token',
      refresh_token: 'gho_refresh_token',
      token_type: 'bearer',
      expires_in: 1, // Expires in 1 second
      scope: 'user,repo',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: 'test_state' });
    await sdk.handleCallback('github', testUserId, callbackParams);

    // Wait for token to expire
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 2: Mock token refresh
    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_new_token',
      refresh_token: 'gho_new_refresh_token',
      token_type: 'bearer',
      expires_in: 3600,
      scope: 'user,repo',
    });

    // Step 3: Mock API call with new token
    nock('https://api.github.com')
      .get('/user/starred')
      .matchHeader('authorization', 'Bearer gho_new_token')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(200, []);

    const items = await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });

    expect(items).toHaveLength(0);
  });

  it('should handle OAuth errors gracefully', async () => {
    await sdk.connect('github', testUserId);

    // Mock token exchange failure
    nock('https://github.com').post('/login/oauth/access_token').reply(400, {
      error: 'invalid_grant',
      error_description: 'The authorization code is invalid or expired',
    });

    const callbackParams = new URLSearchParams({ code: 'invalid_code', state: 'test_state' });

    await expect(sdk.handleCallback('github', testUserId, callbackParams)).rejects.toThrow();
  });

  it('should handle rate limiting with 429 response', async () => {
    // Setup token
    await sdk.connect('github', testUserId);

    nock('https://github.com').post('/login/oauth/access_token').reply(200, {
      access_token: 'gho_test_token',
      token_type: 'bearer',
      scope: 'user,repo',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: 'test_state' });
    await sdk.handleCallback('github', testUserId, callbackParams);

    // Mock rate limit response, then success
    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(
        429,
        { message: 'API rate limit exceeded' },
        {
          'Retry-After': '1',
        }
      );

    nock('https://api.github.com')
      .get('/user/starred')
      .query({ per_page: 10, page: 1, sort: 'updated', direction: 'desc' })
      .reply(200, []);

    const items = await sdk.fetch('github', testUserId, { type: 'starred', limit: 10 });

    expect(items).toHaveLength(0);
  });
});
