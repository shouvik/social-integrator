// tests/unit/ConfigValidator.test.ts

import { describe, it, expect } from 'vitest';
import { validateConfig, validateConfigSafe } from '../../src/config/ConfigValidator';

describe('ConfigValidator', () => {
  const validConfig = {
    tokenStore: {
      backend: 'memory' as const
    },
    http: {
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableStatusCodes: [429, 500, 502, 503, 504]
      }
    },
    rateLimits: {
      github: { qps: 10, concurrency: 5 }
    },
    providers: {
      github: {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        scopes: ['user'],
        redirectUri: 'http://localhost:3000/callback',
        usePKCE: true
      }
    }
  };
  
  it('should validate correct configuration', () => {
    const validated = validateConfig(validConfig);
    expect(validated).toBeDefined();
    expect(validated.tokenStore.backend).toBe('memory');
  });
  
  it('should reject invalid token store backend', () => {
    const invalid = {
      ...validConfig,
      tokenStore: { backend: 'invalid' }
    };
    
    expect(() => validateConfig(invalid)).toThrow(/backend must be/);
  });
  
  it('should require URL for redis backend', () => {
    const invalid = {
      ...validConfig,
      tokenStore: { backend: 'redis' }  // Missing URL
    };
    
    expect(() => validateConfig(invalid)).toThrow(/Redis and Postgres backends require 'url'/);
  });
  
  it('should validate encryption key length', () => {
    const invalid = {
      ...validConfig,
      tokenStore: {
        backend: 'memory' as const,
        encryption: {
          key: 'tooshort',  // Not 64 characters
          algorithm: 'aes-256-gcm' as const
        }
      }
    };
    
    expect(() => validateConfig(invalid)).toThrow();  // Just validate it throws
  });
  
  it('should validate retry config', () => {
    const invalid = {
      ...validConfig,
      http: {
        retry: {
          maxRetries: 3,
          baseDelay: 5000,
          maxDelay: 1000,  // Less than baseDelay
          retryableStatusCodes: [429]
        }
      }
    };
    
    expect(() => validateConfig(invalid)).toThrow(/maxDelay must be greater than or equal to baseDelay/);
  });
  
  it('should require at least one provider', () => {
    const invalid = {
      ...validConfig,
      providers: {}  // Empty providers
    };
    
    expect(() => validateConfig(invalid)).toThrow(/At least one provider must be configured/);
  });
  
  it('should validate OAuth2 config structure', () => {
    const invalid = {
      ...validConfig,
      providers: {
        github: {
          clientId: 'test',
          // Missing clientSecret
          scopes: ['user'],
          redirectUri: 'http://localhost:3000/callback',
          usePKCE: true
        }
      }
    };
    
    expect(() => validateConfig(invalid)).toThrow();
  });
  
  it('should validate URL formats', () => {
    const invalid = {
      ...validConfig,
      providers: {
        github: {
          clientId: 'test',
          clientSecret: 'secret',
          scopes: ['user'],
          redirectUri: 'not-a-url',  // Invalid URL
          usePKCE: true
        }
      }
    };
    
    expect(() => validateConfig(invalid)).toThrow(/Invalid url/);
  });
  
  it('should validate metrics port range', () => {
    const invalid = {
      ...validConfig,
      metrics: {
        enabled: true,
        port: 999  // Below 1024 (reserved)
      }
    };
    
    expect(() => validateConfig(invalid)).toThrow();
  });
  
  it('should return friendly errors with validateConfigSafe', () => {
    const invalid = {
      ...validConfig,
      tokenStore: { backend: 'invalid' }
    };
    
    const result = validateConfigSafe(invalid);
    
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain('tokenStore.backend');
  });
  
  it('should return data on successful validation with validateConfigSafe', () => {
    const result = validateConfigSafe(validConfig);
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.errors).toBeUndefined();
  });
});

