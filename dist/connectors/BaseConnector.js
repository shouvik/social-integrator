"use strict";
// src/connectors/BaseConnector.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseConnector = void 0;
const errors_1 = require("../utils/errors");
class BaseConnector {
    deps;
    // Distributed lock for refresh deduplication
    refreshLocks = new Map();
    preRefreshMarginMs = 5 * 60 * 1000; // 5 minutes
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Default OAuth2 connect implementation
     */
    async connect(userId, opts) {
        // Check if this connector has provider-specific options
        let finalOpts = opts;
        if (typeof this.getConnectOptions === 'function') {
            finalOpts = this.getConnectOptions(opts);
        }
        const authUrl = this.deps.auth.createAuthUrl(this.name, userId, finalOpts);
        this.deps.logger.info('Connect initiated', { provider: this.name, userId });
        return authUrl;
    }
    /**
     * Default OAuth2 callback handler
     */
    async handleCallback(userId, params) {
        const code = params.get('code');
        const state = params.get('state');
        if (!code || !state) {
            throw new Error('Missing code or state parameter');
        }
        const tokenSet = await this.deps.auth.exchangeCode(this.name, code, state, this.getRedirectUri());
        await this.deps.tokens.setToken(userId, this.name, tokenSet);
        this.deps.metrics.incrementCounter('connections_total', { provider: this.name });
        return tokenSet;
    }
    /**
     * Default disconnect implementation
     * CRITICAL FIX: Include expired tokens to ensure cleanup
     */
    async disconnect(userId) {
        // Include expired tokens to ensure we clean up all stored credentials
        const token = await this.deps.tokens.getToken(userId, this.name, { includeExpired: true });
        if (token) {
            // Only attempt revocation if token is not expired
            if (token.expiresAt && new Date(token.expiresAt) > new Date()) {
                try {
                    await this.deps.auth.revokeToken(this.name, token.accessToken);
                }
                catch (error) {
                    // Log revocation failure but continue with deletion
                    this.deps.logger.warn('Token revocation failed', {
                        provider: this.name,
                        userId,
                        error: error.message,
                    });
                }
            }
            // Always delete from storage, even if expired or revocation failed
            await this.deps.tokens.deleteToken(userId, this.name);
        }
        this.deps.logger.info('Disconnected', { provider: this.name, userId });
    }
    /**
     * CRITICAL v1.1 FIX #5: Get access token with auto-refresh
     */
    async getAccessToken(userId) {
        // Request expired tokens explicitly for refresh evaluation
        let token = await this.deps.tokens.getToken(userId, this.name, { includeExpired: true });
        if (!token) {
            throw new errors_1.TokenNotFoundError(`No token found for ${this.name}`);
        }
        // Check if refresh needed
        const needsRefresh = token.expiresAt &&
            token.refreshToken &&
            token.expiresAt.getTime() <= Date.now() + this.preRefreshMarginMs;
        if (needsRefresh) {
            this.deps.logger.info('Auto-refreshing token', {
                provider: this.name,
                userId,
                expiresAt: token.expiresAt?.toISOString(),
                expired: token.expiresAt ? token.expiresAt.getTime() <= Date.now() : false,
            });
            token = await this.refreshWithDedup(userId, token.refreshToken);
        }
        return token.accessToken;
    }
    /**
     * CRITICAL v1.1 FIX #1: Refresh with deduplication
     */
    async refreshWithDedup(userId, refreshToken) {
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
            if (!token)
                throw new errors_1.TokenRefreshError('Refresh failed across cluster');
            return token;
        }
        // We acquired the lock, execute refresh
        const refreshPromise = this.executeRefresh(userId, refreshToken, lockKey);
        this.refreshLocks.set(lockKey, refreshPromise);
        try {
            return await refreshPromise;
        }
        finally {
            await this.deps.refreshLock.release(userId, this.name);
            setTimeout(() => this.refreshLocks.delete(lockKey), 1000);
        }
    }
    /**
     * Execute actual refresh with error handling
     */
    async executeRefresh(userId, refreshToken, _lockKey) {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorCode = error instanceof Error && 'code' in error
                ? String(error.code)
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
                throw new errors_1.TokenExpiredError('Refresh token invalid, re-authentication required', {
                    userId,
                    provider: this.name,
                });
            }
            throw error;
        }
    }
}
exports.BaseConnector = BaseConnector;
//# sourceMappingURL=BaseConnector.js.map