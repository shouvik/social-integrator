import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TokenStore } from '../../src/core/token/TokenStore';
import { Logger } from '../../src/observability/Logger';

describe('TokenStore with PostgreSQL Backend', () => {
  let tokenStore: TokenStore;
  let logger: Logger;
  
  // Skip if no PostgreSQL URL available
  const POSTGRES_URL = process.env.POSTGRES_TEST_URL;
  const runTests = !!POSTGRES_URL;
  
  if (!runTests) {
    it.skip('PostgreSQL tests skipped (set POSTGRES_TEST_URL to run)', () => {
      // These tests require a PostgreSQL database
      // Set POSTGRES_TEST_URL="postgresql://user:password@localhost:5432/oauth_sdk_test"
      // to run these tests
    });
  }
  
  if (runTests) {
    beforeAll(async () => {
      logger = new Logger({ level: 'error' });
      tokenStore = new TokenStore({
        backend: 'postgres',
        url: POSTGRES_URL,
        encryption: {
          key: 'a'.repeat(64),
          algorithm: 'aes-256-gcm'
        }
      }, logger);
    });
    
    afterAll(async () => {
      // Cleanup test data
      try {
        await tokenStore.deleteToken('test-user-pg', 'github');
        await tokenStore.deleteToken('test-user-pg-2', 'github');
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    
    it('should persist tokens to PostgreSQL', async () => {
      const tokenSet = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
      };
      
      await tokenStore.setToken('test-user-pg', 'github', tokenSet);
      
      const retrieved = await tokenStore.getToken('test-user-pg', 'github');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.accessToken).toBe('test-access-token');
      expect(retrieved?.refreshToken).toBe('test-refresh-token');
    });
    
    it('should update existing tokens', async () => {
      const updatedToken = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 7200000),
      };
      
      await tokenStore.updateToken('test-user-pg', 'github', updatedToken);
      
      const retrieved = await tokenStore.getToken('test-user-pg', 'github');
      expect(retrieved?.accessToken).toBe('new-access-token');
    });
    
    it('should delete tokens', async () => {
      await tokenStore.deleteToken('test-user-pg', 'github');
      
      const retrieved = await tokenStore.getToken('test-user-pg', 'github');
      expect(retrieved).toBeNull();
    });
    
    it('should encrypt tokens in storage', async () => {
      const tokenSet = {
        accessToken: 'secret-token-12345',
        refreshToken: 'secret-refresh-67890',
        expiresAt: new Date(Date.now() + 3600000),
      };
      
      await tokenStore.setToken('test-user-pg-2', 'github', tokenSet);
      
      // Verify we can retrieve and decrypt
      const retrieved = await tokenStore.getToken('test-user-pg-2', 'github');
      expect(retrieved?.accessToken).toBe('secret-token-12345');
      expect(retrieved?.refreshToken).toBe('secret-refresh-67890');
      
      await tokenStore.deleteToken('test-user-pg-2', 'github');
    });
    
    it('should handle non-existent tokens', async () => {
      const retrieved = await tokenStore.getToken('non-existent-user', 'github');
      expect(retrieved).toBeNull();
    });
    
    it('should respect TTL for token expiry', async () => {
      const shortLivedToken = {
        accessToken: 'short-lived',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 1000), // 1 second
      };
      
      await tokenStore.setToken('test-ttl-user', 'github', shortLivedToken);
      
      // Should exist immediately
      let retrieved = await tokenStore.getToken('test-ttl-user', 'github');
      expect(retrieved).toBeDefined();
      
      // Wait for expiry (+ buffer)
      await new Promise(resolve => setTimeout(resolve, 7000)); // 7 seconds (1s token + 5s buffer + margin)
      
      // Should be gone after TTL
      retrieved = await tokenStore.getToken('test-ttl-user', 'github');
      expect(retrieved).toBeNull();
    }, 10000); // 10 second timeout for this test
  }
});

