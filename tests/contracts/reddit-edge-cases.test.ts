/**
 * Reddit Edge Cases Contract Tests
 *
 * Tests edge cases and error scenarios for RedditConnector to improve branch coverage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConnectorSDK } from '../../src/sdk';

describe('Reddit Edge Cases', () => {
  let sdk: ConnectorSDK;
  const testUserId = 'test-user-reddit';
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
        reddit: {
          clientId: 'test-reddit-client',
          clientSecret: 'test-reddit-secret',
          authorizationEndpoint: 'https://www.reddit.com/api/v1/authorize',
          tokenEndpoint: 'https://www.reddit.com/api/v1/access_token',
          scopes: ['identity', 'read', 'history'],
          redirectUri: 'http://localhost:3000/callback/reddit',
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

  it('should fetch upvoted posts', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    nock('https://oauth.reddit.com').get('/api/v1/me').reply(200, {
      name: 'test_user',
      id: 't2_123',
    });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/upvoted')
      .query({ limit: 10, raw_json: 1 })
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'upvoted1',
                title: 'Upvoted post',
                url: 'https://reddit.com/r/test',
                author: 'author1',
                created_utc: 1705316400,
                subreddit: 'test',
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, { type: 'upvoted', limit: 10 });
    expect(items).toHaveLength(1);
  });

  it('should fetch comments', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    nock('https://oauth.reddit.com').get('/api/v1/me').reply(200, {
      name: 'test_user',
      id: 't2_123',
    });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/comments')
      .query({ limit: 10, raw_json: 1 })
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't1',
              data: {
                id: 'comment1',
                body: 'Test comment',
                author: 'test_user',
                created_utc: 1705316400,
                subreddit: 'test',
                score: 5,
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, { type: 'comments', limit: 10 });
    expect(items).toHaveLength(1);
  });

  it('should fetch submitted posts', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    nock('https://oauth.reddit.com').get('/api/v1/me').reply(200, {
      name: 'test_user',
      id: 't2_123',
    });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/submitted')
      .query({ limit: 10, raw_json: 1 })
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'submitted1',
                title: 'My submission',
                url: 'https://reddit.com/r/test',
                author: 'test_user',
                created_utc: 1705316400,
                subreddit: 'test',
              },
            },
          ],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId, { type: 'submitted', limit: 10 });
    expect(items).toHaveLength(1);
  });

  it('should handle pagination with after param', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    nock('https://oauth.reddit.com').get('/api/v1/me').reply(200, {
      name: 'test_user',
      id: 't2_123',
    });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/saved')
      .query({ limit: 10, raw_json: 1, after: 't3_abc123' })
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: 'next_page',
                title: 'Next page post',
                url: 'https://reddit.com/r/test',
                author: 'author',
                created_utc: 1705316400,
                subreddit: 'test',
              },
            },
          ],
          after: 't3_xyz789',
        },
      });

    const items = await sdk.fetch('reddit', testUserId, {
      type: 'saved',
      limit: 10,
      after: 't3_abc123',
    });
    expect(items).toHaveLength(1);
  });

  it('should default to saved posts when no type specified', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    nock('https://oauth.reddit.com').get('/api/v1/me').reply(200, {
      name: 'test_user',
      id: 't2_123',
    });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/saved')
      .query({ limit: 25, raw_json: 1 })
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [],
          after: null,
        },
      });

    const items = await sdk.fetch('reddit', testUserId);
    expect(items).toHaveLength(0);
  });

  it('should handle empty response', async () => {
    const authUrl = await sdk.connect('reddit', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://www.reddit.com').post('/api/v1/access_token').reply(200, {
      access_token: 'reddit_token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('reddit', testUserId, callbackParams);

    nock('https://oauth.reddit.com').get('/api/v1/me').reply(200, {
      name: 'test_user',
      id: 't2_123',
    });

    nock('https://oauth.reddit.com')
      .get('/user/test_user/saved')
      .query({ limit: 10, raw_json: 1 })
      .reply(200, {
        kind: 'Listing',
        data: {
          children: [],
        },
      });

    const items = await sdk.fetch('reddit', testUserId, { type: 'saved', limit: 10 });
    expect(items).toHaveLength(0);
  });
});
