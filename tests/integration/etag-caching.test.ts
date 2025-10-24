// tests/integration/etag-caching.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import nock from 'nock';
import { ConnectorSDK } from '../../src/sdk';
import type { NormalizedItem } from '../../src/core/normalizer/types';

describe('ETag Caching Integration', () => {
  let sdk: ConnectorSDK;
  
  beforeEach(async () => {
    nock.cleanAll();
    
    sdk = await ConnectorSDK.init({
      tokenStore: { backend: 'memory' },
      http: {
        retry: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          retryableStatusCodes: [429, 500, 502, 503, 504]
        }
      },
      rateLimits: {
        github: { qps: 100, concurrency: 10 },
        google: { qps: 100, concurrency: 10 },
        reddit: { qps: 100, concurrency: 10 },
        x: { qps: 100, concurrency: 10 },
        rss: { qps: 100, concurrency: 10 }
      },
      providers: {
        github: {
          clientId: 'test-client',
          clientSecret: 'test-secret',
          authorizationEndpoint: 'https://github.com/login/oauth/authorize',
          tokenEndpoint: 'https://github.com/login/oauth/access_token',
          scopes: ['user', 'repo'],
          redirectUri: 'http://localhost:3000/callback',
          usePKCE: true
        }
      }
    });
    
    // Mock token (skip OAuth flow for testing)
    await sdk['core'].tokens.setToken('user123', 'github', {
      accessToken: 'test_token',
      refreshToken: 'refresh_token',
      expiresAt: new Date(Date.now() + 3600000)
    });
  });
  
  it('should return normalized data on both fresh and cached responses', async () => {
    // First request: 200 OK with ETag
    const githubRepo = {
      id: 123456,
      name: 'awesome-repo',
      description: 'An awesome repository',
      html_url: 'https://github.com/user/awesome-repo',
      owner: { login: 'testuser' },
      created_at: '2025-01-01T00:00:00Z',
      stargazers_count: 1000,
      language: 'TypeScript',
      topics: ['sdk', 'oauth']
    };
    
    nock('https://api.github.com')
      .get('/user/starred')
      .query(true)
      .reply(200, [githubRepo], {
        ETag: '"abc123"'
      });
    
    const items1 = await sdk.fetch('github', 'user123', { type: 'starred' });
    
    // Validate first response is normalized
    expect(items1).toHaveLength(1);
    expect(items1[0]).toMatchObject({
      source: 'github',
      externalId: '123456',  // String, not number
      userId: 'user123',
      title: 'awesome-repo',
      bodyText: 'An awesome repository',
      url: 'https://github.com/user/awesome-repo',
      author: 'testuser'
    });
    
    // Validate fields match NormalizedItem schema
    expect(items1[0]).toHaveProperty('id');  // UUID
    expect(items1[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(items1[0]).toHaveProperty('publishedAt');
    expect(items1[0].publishedAt).toBe('2025-01-01T00:00:00.000Z');  // ISO 8601
    expect(items1[0].metadata).toEqual({
      stars: 1000,
      language: 'TypeScript',
      topics: ['sdk', 'oauth']
    });
    
    // Validate NO raw GitHub fields
    expect(items1[0]).not.toHaveProperty('html_url');  // Should be 'url'
    expect(items1[0]).not.toHaveProperty('owner');     // Should be 'author'
    expect(items1[0]).not.toHaveProperty('created_at'); // Should be 'publishedAt'
    
    // Second request: 304 Not Modified (cache hit)
    const conditionalRequest = nock('https://api.github.com')
      .get('/user/starred')
      .query(true)
      .matchHeader('If-None-Match', '"abc123"')
      .reply(304);
    
    const items2 = await sdk.fetch('github', 'user123', { type: 'starred' });
    
    // CRITICAL ASSERTION: Cached response should have SAME shape as fresh response
    expect(items2).toHaveLength(1);
    expect(items2[0]).toMatchObject({
      source: 'github',
      externalId: '123456',  // Must be string, not raw 'id'
      userId: 'user123',
      title: 'awesome-repo',
      url: 'https://github.com/user/awesome-repo'  // Must be 'url', not 'html_url'
    });
    
    // Validate normalized fields present on cache hit
    expect(items2[0]).toHaveProperty('id');
    expect(items2[0].id).toMatch(/^[0-9a-f-]+$/i);  // UUID format
    expect(items2[0].publishedAt).toBe('2025-01-01T00:00:00.000Z');
    
    // Validate NO raw fields on cache hit
    expect(items2[0]).not.toHaveProperty('html_url');
    expect(items2[0]).not.toHaveProperty('owner');
    expect(items2[0]).not.toHaveProperty('created_at');
    
    // Verify conditional request was made
    expect(conditionalRequest.isDone()).toBe(true);
  });
  
  it('should handle ETag update when data changes', async () => {
    // First request
    nock('https://api.github.com')
      .get('/user/starred')
      .query(true)
      .reply(200, [{ id: 1, name: 'repo1', created_at: '2025-01-01T00:00:00Z' }], {
        ETag: '"v1"'
      });
    
    await sdk.fetch('github', 'user123', { type: 'starred' });
    
    // Second request with new ETag (data changed)
    nock('https://api.github.com')
      .get('/user/starred')
      .query(true)
      .matchHeader('If-None-Match', '"v1"')
      .reply(200, [
        { id: 1, name: 'repo1', created_at: '2025-01-01T00:00:00Z' },
        { id: 2, name: 'repo2', created_at: '2025-01-02T00:00:00Z' }
      ], {
        ETag: '"v2"'
      });
    
    const items = await sdk.fetch('github', 'user123', { type: 'starred' });
    
    // Should have 2 items and all normalized
    expect(items).toHaveLength(2);
    expect(items[0].source).toBe('github');
    expect(items[1].source).toBe('github');
    expect(items[0]).toHaveProperty('id');  // UUID
    expect(items[1]).toHaveProperty('id');  // UUID
  });
});

