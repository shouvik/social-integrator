// src/connectors/BaseConnector.ts

import type { Connector, FetchParams, CoreDeps } from './types';
import type { ProviderName, NormalizedItem } from '../core/normalizer/types';
import type { TokenSet } from '../core/token/types';
import type { ConnectOptions } from '../core/auth/types';
import { TokenNotFoundError, TokenExpiredError, TokenRefreshError } from '../utils/errors';

export abstract class BaseConnector implements Connector {
  abstract readonly name: ProviderName;

  // Distributed lock for refresh deduplication
  private refreshLocks: Map<string, Promise<TokenSet>> = new Map();
  protected preRefreshMarginMs: number = 5 * 60 * 1000; // 5 minutes

  constructor(protected deps: CoreDeps) {}

  /**
   * Default OAuth2 connect implementation
   */
  async connect(userId: string, opts?: ConnectOptions): Promise<string> {
    // Check if this connector has provider-specific options
    let finalOpts = opts;
    if (typeof (this as any).getConnectOptions === 'function') {
      finalOpts = (this as any).getConnectOptions(opts);
    }

    const authUrl = this.deps.auth.createAuthUrl(this.name, userId, finalOpts);
    this.deps.logger.info('Connect initiated', { provider: this.name, userId });
    return authUrl;
  }

  /**
   * Default OAuth2 callback handler
   */
  async handleCallback(userId: string, params: URLSearchParams): Promise<TokenSet> {
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) {
      throw new Error('Missing code or state parameter');
    }

    const tokenSet = await this.deps.auth.exchangeCode(
      this.name,
      code,
      state,
      this.getRedirectUri()
    );

    await this.deps.tokens.setToken(userId, this.name, tokenSet);

    this.deps.metrics.incrementCounter('connections_total', { provider: this.name });
    return tokenSet;
  }

  /**
   * Default disconnect implementation
   */
  async disconnect(userId: string): Promise<void> {
    const token = await this.deps.tokens.getToken(userId, this.name);
    if (token) {
      await this.deps.auth.revokeToken(this.name, token.accessToken);
      await this.deps.tokens.deleteToken(userId, this.name);
    }
    this.deps.logger.info('Disconnected', { provider: this.name, userId });
  }

  abstract fetch(userId: string, params?: FetchParams): Promise<NormalizedItem[]>;

  /**
   * CRITICAL v1.1 FIX #5: Get access token with auto-refresh
   */
  protected async getAccessToken(userId: string): Promise<string> {
    // Request expired tokens explicitly for refresh evaluation
    let token = await this.deps.tokens.getToken(userId, this.name, { includeExpired: true });

    if (!token) {
      throw new TokenNotFoundError(`No token found for ${this.name}`);
    }

    // Check if refresh needed
    const needsRefresh =
      token.expiresAt &&
      token.refreshToken &&
      token.expiresAt.getTime() <= Date.now() + this.preRefreshMarginMs;

    if (needsRefresh) {
      this.deps.logger.info('Auto-refreshing token', {
        provider: this.name,
        userId,
        expiresAt: token.expiresAt?.toISOString(),
        expired: token.expiresAt ? token.expiresAt.getTime() <= Date.now() : false,
      });

      token = await this.refreshWithDedup(userId, token.refreshToken!);
    }

    return token.accessToken;
  }

  /**
   * CRITICAL v1.1 FIX #1: Refresh with deduplication
   */
  private async refreshWithDedup(userId: string, refreshToken: string): Promise<TokenSet> {
    const lockKey = `${userId}:${this.name}`;

    // Try in-memory lock first (fast path for same instance)
    const existingRefresh = this.refreshLocks.get(lockKey);
    if (existingRefresh) {
      this.deps.metrics.incrementCounter('token_refresh_dedup_local', { provider: this.name });
      this.deps.logger.debug('Refresh already in progress, waiting', {
        provider: this.name,
        userId,
      });
      return existingRefresh;
    }

    // Try distributed lock if available
    const acquired = await this.deps.refreshLock.tryAcquire(userId, this.name);
    if (!acquired) {
      this.deps.logger.debug('Another instance refreshing, waiting', {
        provider: this.name,
        userId,
      });
      this.deps.metrics.incrementCounter('token_refresh_dedup_distributed', {
        provider: this.name,
      });

      // Wait for other instance to complete
      await this.deps.refreshLock.waitForRelease(userId, this.name);

      // Fetch refreshed token
      const token = await this.deps.tokens.getToken(userId, this.name);
      if (!token) throw new TokenRefreshError('Refresh failed across cluster');
      return token;
    }

    // We acquired the lock, execute refresh
    const refreshPromise = this.executeRefresh(userId, refreshToken, lockKey);
    this.refreshLocks.set(lockKey, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      await this.deps.refreshLock.release(userId, this.name);
      setTimeout(() => this.refreshLocks.delete(lockKey), 1000);
    }
  }

  /**
   * Execute actual refresh with error handling
   */
  private async executeRefresh(
    userId: string,
    refreshToken: string,
    _lockKey: string
  ): Promise<TokenSet> {
    const startTime = Date.now();

    try {
      const newToken = await this.deps.auth.refreshToken(this.name, refreshToken);
      await this.deps.tokens.updateToken(userId, this.name, newToken);

      this.deps.metrics.recordLatency('token_refresh_duration', Date.now() - startTime, {
        provider: this.name,
        status: 'success',
      });
      this.deps.metrics.incrementCounter('token_refresh_total', {
        provider: this.name,
        status: 'success',
      });

      return newToken;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof Error && 'code' in error
          ? String((error as Record<string, unknown>).code)
          : 'unknown';

      this.deps.logger.error('Token refresh failed', {
        provider: this.name,
        userId,
        error: errorMessage,
      });

      this.deps.metrics.incrementCounter('token_refresh_failures', {
        provider: this.name,
        errorType: errorCode,
      });
      this.deps.metrics.incrementCounter('token_refresh_total', {
        provider: this.name,
        status: 'failed',
      });

      // If invalid_grant, token is permanently invalid
      if (errorMessage.includes('invalid_grant')) {
        await this.deps.tokens.deleteToken(userId, this.name);
        throw new TokenExpiredError('Refresh token invalid, re-authentication required', {
          userId,
          provider: this.name,
        });
      }

      throw error;
    }
  }

  protected abstract getRedirectUri(): string;
}
