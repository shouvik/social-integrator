// tests/integration/sdk-init.test.ts

import { describe, it, expect } from 'vitest';
import { ConnectorSDK } from '../../src/sdk';

describe('ConnectorSDK Initialization', () => {
  it('should initialize without throwing', async () => {
    const config = {
      tokenStore: { backend: 'memory' as const },
      http: {
        retry: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          retryableStatusCodes: [429, 500, 502, 503, 504]
        }
      },
      rateLimits: {
        github: { qps: 5000 / 3600, concurrency: 10 },
        google: { qps: 10000 / 60, concurrency: 20 },
        reddit: { qps: 60 / 60, concurrency: 5 },
        twitter: { qps: 300 / 900, concurrency: 5 },
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
    };
    
    const sdk = await ConnectorSDK.init(config);
    expect(sdk).toBeDefined();
  });
  
  it('should expose health status', async () => {
    const config = {
      tokenStore: { backend: 'memory' as const },
      http: {
        retry: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          retryableStatusCodes: [429, 500, 502, 503, 504]
        }
      },
      rateLimits: {
        github: { qps: 5000 / 3600, concurrency: 10 },
        google: { qps: 10000 / 60, concurrency: 20 },
        reddit: { qps: 60 / 60, concurrency: 5 },
        twitter: { qps: 300 / 900, concurrency: 5 },
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
    };
    
    const sdk = await ConnectorSDK.init(config);
    const health = sdk.getHealth();
    
    expect(health).toHaveProperty('distributedLocks');
    expect(health.distributedLocks).toHaveProperty('connected');
    expect(health.distributedLocks).toHaveProperty('mode');
    expect(health.distributedLocks).toHaveProperty('healthy');
    
    // Memory-only mode should be local-only and healthy
    expect(health.distributedLocks.mode).toBe('local-only');
    expect(health.distributedLocks.healthy).toBe(true);
  });
});

