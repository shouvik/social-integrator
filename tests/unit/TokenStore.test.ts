// tests/unit/TokenStore.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenStore } from '../../src/core/token/TokenStore';
import type { TokenSet } from '../../src/core/token/types';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
} as any;

describe('TokenStore v1.1', () => {
  let store: TokenStore;
  
  beforeEach(() => {
    vi.clearAllMocks();
    store = new TokenStore({
      backend: 'memory',
      expiredTokenBufferMinutes: 5
    }, mockLogger);
  });
  
  it('should keep expired tokens for buffer period', async () => {
    const expiredToken: TokenSet = {
      accessToken: 'old_access',
      refreshToken: 'valid_refresh',
      expiresAt: new Date(Date.now() - 60000) // Expired 1 minute ago
    };
    
    await store.setToken('user1', 'github', expiredToken);
    
    // Should still be retrievable with includeExpired
    const retrieved = await store.getToken('user1', 'github', { includeExpired: true });
    expect(retrieved).not.toBeNull();
    expect(retrieved?.refreshToken).toBe('valid_refresh');
  });
  
  it('should return null for expired tokens without includeExpired', async () => {
    const expiredToken: TokenSet = {
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() - 60000)
    };
    
    await store.setToken('user1', 'github', expiredToken);
    
    // Default behavior
    const retrieved = await store.getToken('user1', 'github');
    expect(retrieved).toBeNull();
  });
  
  it('should calculate correct TTL for already-expired token', async () => {
    const bufferMinutes = 5;
    const bufferMs = bufferMinutes * 60 * 1000;
    
    const store2 = new TokenStore({
      backend: 'memory',
      expiredTokenBufferMinutes: bufferMinutes
    }, mockLogger);
    
    const expiredToken: TokenSet = {
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() - 120000) // Expired 2 minutes ago
    };
    
    // Spy on Keyv.set to verify TTL
    const setSpy = vi.spyOn(store2['store'], 'set');
    
    await store2.setToken('user1', 'github', expiredToken);
    
    // Verify TTL is at least the buffer
    const ttlUsed = setSpy.mock.calls[0][2];
    expect(ttlUsed).toBeGreaterThanOrEqual(bufferMs);
    expect(ttlUsed).toBeLessThanOrEqual((bufferMinutes + 1) * 60 * 1000);
  });
  
  it('should emit tokenSaved event', async () => {
    const eventSpy = vi.fn();
    store.on('tokenSaved', eventSpy);
    
    const token: TokenSet = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3600000)
    };
    
    await store.setToken('user1', 'github', token);
    
    expect(eventSpy).toHaveBeenCalledWith({ userId: 'user1', provider: 'github' });
  });
  
  it('should emit tokenExpiringSoon event', async () => {
    const eventSpy = vi.fn();
    store.on('tokenExpiringSoon', eventSpy);
    
    const expiringToken: TokenSet = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 2 * 60 * 1000) // Expires in 2 minutes
    };
    
    await store.setToken('user1', 'github', expiringToken);
    await store.getToken('user1', 'github');
    
    expect(eventSpy).toHaveBeenCalled();
  });
});

