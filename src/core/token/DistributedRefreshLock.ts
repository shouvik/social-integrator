// src/core/token/DistributedRefreshLock.ts

import { createClient, RedisClientType } from 'redis';
import type { Logger } from '../../observability/Logger';

export class DistributedRefreshLock {
  private redis?: RedisClientType;
  private ready: Promise<void>;
  private connected = false;
  private lockTTL = 10000; // 10 seconds
  private logger: Logger;
  
  constructor(redisUrl: string | undefined, logger: Logger) {
    this.logger = logger;
    
    if (redisUrl) {
      this.redis = createClient({ 
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              this.logger.error('Redis reconnect failed after 10 attempts');
              return new Error('Max reconnect attempts reached');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });
      
      this.redis.on('error', (err) => {
        this.logger.error('Redis client error', { error: err.message });
        this.connected = false;
      });
      
      this.redis.on('connect', () => {
        this.logger.info('Redis connected for distributed refresh lock');
        this.connected = true;
      });
      
      this.redis.on('disconnect', () => {
        this.logger.warn('Redis disconnected');
        this.connected = false;
      });
      
      // CRITICAL v1.1 FIX #2: Await connection
      this.ready = this.redis.connect()
        .then(() => {
          this.connected = true;
          this.logger.info('DistributedRefreshLock ready');
        })
        .catch((err) => {
          this.logger.error('Failed to connect to Redis for refresh lock', { error: err.message });
          this.logger.warn('Distributed refresh locks disabled - running in local-only mode', {
            impact: 'Multi-instance token refresh deduplication unavailable'
          });
          this.redis = undefined;
        });
    } else {
      this.ready = Promise.resolve();
    }
  }
  
  /**
   * Get Redis connection status for health checks
   * @returns Object with connection status and mode
   */
  getConnectionStatus(): { 
    connected: boolean; 
    mode: 'distributed' | 'local-only';
    healthy: boolean;
  } {
    return {
      connected: this.connected && this.redis !== undefined,
      mode: this.redis !== undefined ? 'distributed' : 'local-only',
      healthy: this.redis !== undefined ? this.connected : true // local-only is "healthy"
    };
  }
  
  /**
   * CRITICAL: Must be called after construction
   */
  async initialize(): Promise<void> {
    await this.ready;
  }
  
  private ensureConnected(): boolean {
    if (!this.redis) return false;
    
    if (!this.connected) {
      this.logger.warn('Redis not connected, skipping distributed lock');
      return false;
    }
    
    return true;
  }
  
  async tryAcquire(userId: string, provider: string): Promise<boolean> {
    if (!this.ensureConnected()) {
      return true; // No Redis, allow (in-memory dedupe only)
    }
    
    const key = `refresh_lock:${userId}:${provider}`;
    
    try {
      const result = await this.redis!.set(key, '1', {
        PX: this.lockTTL,
        NX: true
      });
      
      const acquired = result === 'OK';
      
      if (acquired) {
        this.logger.debug('Acquired distributed refresh lock', { userId, provider });
      } else {
        this.logger.debug('Distributed refresh lock already held', { userId, provider });
      }
      
      return acquired;
      
    } catch (error: any) {
      this.logger.error('Failed to acquire distributed lock', { 
        userId, 
        provider, 
        error: error.message 
      });
      return true;
    }
  }
  
  async waitForRelease(userId: string, provider: string, timeoutMs = 5000): Promise<void> {
    if (!this.ensureConnected()) return;
    
    const key = `refresh_lock:${userId}:${provider}`;
    const startTime = Date.now();
    
    try {
      while (Date.now() - startTime < timeoutMs) {
        const exists = await this.redis!.exists(key);
        if (!exists) {
          this.logger.debug('Distributed lock released', { userId, provider });
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      this.logger.warn('Timeout waiting for distributed lock release', { 
        userId, 
        provider, 
        timeoutMs 
      });
      
    } catch (error: any) {
      this.logger.error('Error waiting for lock release', { 
        userId, 
        provider, 
        error: error.message 
      });
    }
  }
  
  async release(userId: string, provider: string): Promise<void> {
    if (!this.ensureConnected()) return;
    
    const key = `refresh_lock:${userId}:${provider}`;
    
    try {
      await this.redis!.del(key);
      this.logger.debug('Released distributed lock', { userId, provider });
    } catch (error: any) {
      this.logger.error('Failed to release distributed lock', { 
        userId, 
        provider, 
        error: error.message 
      });
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.redis && this.connected) {
      try {
        await this.redis.quit();
        this.logger.info('DistributedRefreshLock disconnected');
      } catch (error: any) {
        this.logger.error('Error disconnecting Redis', { error: error.message });
      }
    }
  }
}

