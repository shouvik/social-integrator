/**
 * Contract test: Google OAuth flow
 *
 * Tests Google-specific OAuth 2.0 requirements:
 * - access_type=offline for refresh tokens
 * - prompt=consent to force re-consent
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConnectorSDK } from '../../src/sdk';

describe('Google OAuth Flow Contract', () => {
  let sdk: ConnectorSDK;
  const testUserId = 'test-user-123';
  const mockEncryptionKey = '0'.repeat(64);

  beforeEach(async () => {
    sdk = await ConnectorSDK.init({
      tokenStore: {
        backend: 'memory',
        encryption: {
          key: mockEncryptionKey,
          algorithm: 'aes-256-gcm',
        },
      },
      providers: {
        google: {
          clientId: 'test-google-client',
          clientSecret: 'test-google-secret',
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
          scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
          redirectUri: 'http://localhost:3000/callback/google',
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
        level: 'error',
      },
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should generate authorization URL with access_type=offline and prompt=consent', async () => {
    const authUrl = await sdk.connect('google', testUserId);

    expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authUrl).toContain('access_type=offline'); // Required for refresh token
    expect(authUrl).toContain('prompt=consent'); // Force re-consent
    expect(authUrl).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly');
  });

  it('should exchange code for tokens with refresh token', async () => {
    // Get auth URL and extract the real state
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.test_access_token',
      refresh_token: 'ya29.test_refresh_token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    });

    // Use the actual state from the auth URL
    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    // Mock Gmail API call
    nock('https://gmail.googleapis.com')
      .get('/gmail/v1/users/me/messages')
      .query({ maxResults: 10, q: 'is:unread' })
      .reply(200, {
        messages: [{ id: '18c123', threadId: '18c123' }],
      });

    nock('https://gmail.googleapis.com')
      .get('/gmail/v1/users/me/messages/18c123')
      .query({ format: 'full' })
      .reply(200, {
        id: '18c123',
        threadId: '18c123',
        snippet: 'Test email content',
        internalDate: '1705316400000',
        payload: {
          headers: [
            { name: 'Subject', value: 'Test Email' },
            { name: 'From', value: 'sender@example.com' },
          ],
        },
        labelIds: ['INBOX', 'UNREAD'],
      });

    const items = await sdk.fetch('google', testUserId, { service: 'gmail', limit: 10 });

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('google');
    expect(items[0].title).toBe('Test Email');
  });
});
