// src/core/token/TokenStore.ts

import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import KeyvPostgres from '@keyv/postgres';
import { EventEmitter } from 'events';
import type { TokenSet, StoredToken, TokenStoreConfig } from './types';
import type { ProviderName } from '../normalizer/types';
import { TokenEncryption } from './TokenEncryption';
import type { Logger } from '../../observability/Logger';
import { withTokenSpan } from '../../observability/tracing';

export class TokenStore extends EventEmitter {
  private store: Keyv;
  private encryption?: TokenEncryption;
  private logger: Logger;
  private preRefreshMarginMinutes: number;
  private expiredTokenBufferMs: number; // CRITICAL: v1.1 addition

  constructor(
    config: TokenStoreConfig,
    logger: Logger,
    private configuredProviders?: ProviderName[]
  ) {
    super();
    this.logger = logger;
    this.preRefreshMarginMinutes = config.preRefreshMarginMinutes ?? 5;
    this.expiredTokenBufferMs = (config.expiredTokenBufferMinutes ?? 5) * 60 * 1000;

    // Initialize backend
    if (config.backend === 'redis') {
      this.store = new Keyv({ store: new KeyvRedis(config.url!) });
    } else if (config.backend === 'postgres') {
      this.store = new Keyv({ store: new KeyvPostgres(config.url!) });
    } else {
      this.store = new Keyv(); // Memory
    }

    // Initialize encryption
    if (config.encryption) {
      this.encryption = new TokenEncryption(config.encryption.key);
    }
  }

  /**
   * Get token for user + provider
   * CRITICAL: v1.1 - Added includeExpired option
   */
  async getToken(
    userId: string,
    provider: ProviderName,
    opts: { includeExpired?: boolean } = {}
  ): Promise<TokenSet | null> {
    const stored = await this.getStoredToken(userId, provider);
    if (!stored) {
      this.logger.debug('Token not found', { userId, provider });
      return null;
    }

    const now = Date.now();
    const isExpired = stored.tokenSet.expiresAt && now >= stored.tokenSet.expiresAt.getTime();

    // v1.1 FIX: Return null for expired tokens unless explicitly requested
    if (isExpired && !opts.includeExpired) {
      this.logger.warn('Token expired', { userId, provider });
      this.emit('tokenExpired', { userId, provider });
      return null;
    }

    // Emit warning if expiring soon
    if (stored.tokenSet.expiresAt) {
      const minutesUntilExpiry = (stored.tokenSet.expiresAt.getTime() - now) / 60000;

      if (minutesUntilExpiry > 0 && minutesUntilExpiry <= this.preRefreshMarginMinutes) {
        this.emit('tokenExpiringSoon', { userId, provider, minutesUntilExpiry });
      }
    }

    return stored.tokenSet;
  }

  /**
   * Save token
   * CRITICAL: v1.1 FIX #1 - Buffered TTL calculation
   */
  async setToken(
    userId: string,
    provider: ProviderName,
    tokenSet: TokenSet,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    return withTokenSpan('setToken', provider, userId, async () => {
      const key = this.createKey(userId, provider);
      const now = new Date();

      const stored: StoredToken = {
        userId,
        provider,
        tokenSet,
        createdAt: now,
        updatedAt: now,
        metadata,
      };

      const toStore = this.encryption ? this.encryption.encrypt(JSON.stringify(stored)) : stored;

      // CRITICAL v1.1 FIX: Buffered TTL to keep expired tokens for refresh
      let ttlMs: number | undefined;

      if (tokenSet.expiresAt) {
        const timeUntilExpiry = tokenSet.expiresAt.getTime() - Date.now();
        // Ensure minimum buffer even for already-expired tokens
        ttlMs = Math.max(timeUntilExpiry + this.expiredTokenBufferMs, this.expiredTokenBufferMs);

        this.logger.debug('Token TTL calculated', {
          userId,
          provider,
          timeUntilExpiry,
          bufferMs: this.expiredTokenBufferMs,
          finalTtlMs: ttlMs,
          expiresAt: tokenSet.expiresAt.toISOString(),
        });
      }

      await this.store.set(key, toStore, ttlMs);

      this.logger.info('Token saved', {
        userId,
        provider,
        expiresAt: tokenSet.expiresAt?.toISOString(),
        ttlMs,
      });

      this.emit('tokenSaved', { userId, provider });
    });
  }

  /**
   * Update existing token (for refresh)
   * CRITICAL: v1.1 - Same buffered TTL logic
   */
  async updateToken(userId: string, provider: ProviderName, tokenSet: TokenSet): Promise<void> {
    return withTokenSpan('updateToken', provider, userId, async () => {
      const existing = await this.getStoredToken(userId, provider);
      if (!existing) {
        this.logger.warn('Token not found during update, creating new', { userId, provider });
        await this.setToken(userId, provider, tokenSet);
        return;
      }

      const updated: StoredToken = {
        ...existing,
        tokenSet,
        updatedAt: new Date(),
      };

      const key = this.createKey(userId, provider);
      const toStore = this.encryption ? this.encryption.encrypt(JSON.stringify(updated)) : updated;

      // Same TTL logic as setToken
      let ttlMs: number | undefined;

      if (tokenSet.expiresAt) {
        const timeUntilExpiry = tokenSet.expiresAt.getTime() - Date.now();
        ttlMs = Math.max(timeUntilExpiry + this.expiredTokenBufferMs, this.expiredTokenBufferMs);
      }

      await this.store.set(key, toStore, ttlMs);

      this.logger.info('Token refreshed', { userId, provider, ttlMs });
      this.emit('tokenRefreshed', { userId, provider });
    });
  }

  async deleteToken(userId: string, provider: ProviderName): Promise<void> {
    const key = this.createKey(userId, provider);
    await this.store.delete(key);

    this.logger.info('Token deleted', { userId, provider });
    this.emit('tokenDeleted', { userId, provider });
  }

  async listTokens(userId: string): Promise<ProviderName[]> {
    // CRITICAL FIX: Use configured providers instead of hardcoded list
    const providers =
      this.configuredProviders ||
      (['google', 'github', 'reddit', 'twitter', 'x', 'rss'] as ProviderName[]);
    const results: ProviderName[] = [];

    for (const provider of providers) {
      const token = await this.getToken(userId, provider);
      if (token) results.push(provider);
    }

    this.logger.debug('Listed tokens', {
      userId,
      configuredProviders: this.configuredProviders?.length ?? 'fallback',
      foundTokens: results.length,
    });

    return results;
  }

  private createKey(userId: string, provider: ProviderName): string {
    return `token:${userId}:${provider}`;
  }

  private async getStoredToken(
    userId: string,
    provider: ProviderName
  ): Promise<StoredToken | null> {
    const key = this.createKey(userId, provider);
    const encrypted = await this.store.get(key);

    if (!encrypted) return null;

    const parsed = this.encryption ? JSON.parse(this.encryption.decrypt(encrypted)) : encrypted;

    // Deserialize Date objects
    if (parsed.tokenSet.expiresAt) {
      parsed.tokenSet.expiresAt = new Date(parsed.tokenSet.expiresAt);
    }
    if (parsed.createdAt) {
      parsed.createdAt = new Date(parsed.createdAt);
    }
    if (parsed.updatedAt) {
      parsed.updatedAt = new Date(parsed.updatedAt);
    }

    return parsed;
  }
}
