// tests/unit/Logger.test.ts

import { describe, it, expect } from 'vitest';
import { Logger } from '../../src/observability/Logger';

describe('Logger', () => {
  const logger = new Logger({ level: 'debug', format: 'json' });
  
  it('should redact accessToken in metadata', () => {
    // Test the redaction method directly
    const sensitiveData = {
      userId: 'user123',
      accessToken: 'secret_access_token_12345'
    };
    
    const redacted = logger['redactSensitive'](sensitiveData);
    
    expect(redacted.userId).toBe('user123');
    expect(redacted.accessToken).toBe('[REDACTED]');
  });
  
  it('should redact refreshToken in metadata', () => {
    const sensitiveData = {
      provider: 'github',
      refreshToken: 'secret_refresh_token_67890'
    };
    
    const redacted = logger['redactSensitive'](sensitiveData);
    
    expect(redacted.provider).toBe('github');
    expect(redacted.refreshToken).toBe('[REDACTED]');
  });
  
  it('should redact nested tokenSet fields', () => {
    const sensitiveData = {
      userId: 'user456',
      tokenSet: {
        accessToken: 'nested_secret_access',
        refreshToken: 'nested_secret_refresh',
        expiresAt: new Date('2025-01-01')
      }
    };
    
    const redacted = logger['redactSensitive'](sensitiveData);
    
    expect(redacted.tokenSet.accessToken).toBe('[REDACTED]');
    expect(redacted.tokenSet.refreshToken).toBe('[REDACTED]');
    expect(redacted.tokenSet.expiresAt).toEqual(new Date('2025-01-01'));  // Preserved
  });
  
  it('should preserve non-sensitive data', () => {
    const data = {
      userId: 'user123',
      provider: 'github',
      itemCount: 50,
      duration: 245
    };
    
    const redacted = logger['redactSensitive'](data);
    
    expect(redacted).toEqual(data);  // No changes
  });
  
  it('should handle null/undefined gracefully', () => {
    expect(logger['redactSensitive'](null)).toBe(null);
    expect(logger['redactSensitive'](undefined)).toBe(undefined);
    expect(logger['redactSensitive']('string')).toBe('string');
  });
  
  it('should not throw when logging', () => {
    // Just verify methods don't throw
    expect(() => {
      logger.debug('Debug message', { key: 'value' });
      logger.info('Info message', { key: 'value' });
      logger.warn('Warn message', { key: 'value' });
      logger.error('Error message', { key: 'value' });
    }).not.toThrow();
  });
});

