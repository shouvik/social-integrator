"use strict";
// src/core/auth/AuthCore.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthCore = void 0;
const openid_client_1 = require("openid-client");
const errors_1 = require("../../utils/errors");
const tracing_1 = require("../../observability/tracing");
class AuthCore {
    config;
    oauth2Clients = new Map();
    pkceStore = new Map();
    PKCE_TTL = 600000; // 10 minutes
    cleanupInterval;
    logger;
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        // Periodic cleanup of expired PKCE challenges
        this.cleanupInterval = setInterval(() => this.cleanupExpiredChallenges(), 60000);
    }
    /**
     * Initialize OAuth2 clients (discover endpoints)
     */
    async initialize() {
        for (const [provider, cfg] of Object.entries(this.config)) {
            // All configured providers are OAuth2 now
            const client = await this.createOAuth2Client(provider, cfg);
            this.oauth2Clients.set(provider, client);
        }
        this.logger.info('AuthCore initialized', { providers: Array.from(this.oauth2Clients.keys()) });
    }
    /**
     * Create authorization URL with PKCE
     */
    createAuthUrl(provider, userId, opts) {
        const client = this.oauth2Clients.get(provider);
        if (!client)
            throw new errors_1.OAuthConfigError(`Provider ${provider} not configured`);
        const state = opts?.state ?? openid_client_1.generators.state();
        const pkce = this.generatePKCE();
        // Generate nonce only for OIDC providers (Google with discovery)
        // Non-OIDC providers (GitHub, Reddit, Twitter) and Google with explicit endpoints don't use nonce
        const isOIDC = provider === 'google' && !this.config[provider].authorizationEndpoint;
        const nonce = isOIDC ? openid_client_1.generators.nonce() : undefined;
        // Store PKCE and nonce (if applicable) for later validation
        this.pkceStore.set(state, { ...pkce, nonce, createdAt: Date.now() });
        const authParams = {
            scope: this.config[provider].scopes.join(' '),
            state,
            code_challenge: pkce.codeChallenge,
            code_challenge_method: pkce.method,
            ...opts?.extraParams,
        };
        // Only add nonce for OIDC providers
        if (nonce) {
            authParams.nonce = nonce;
        }
        // CRITICAL FIX: Honor OAuth configuration flags
        if (opts?.prompt) {
            authParams.prompt = opts.prompt;
        }
        if (opts?.loginHint) {
            authParams.login_hint = opts.loginHint;
        }
        const authUrl = client.authorizationUrl(authParams);
        this.logger.debug('Created auth URL', { provider, userId, state });
        return authUrl;
    }
    /**
     * Exchange authorization code for tokens
     */
    async exchangeCode(provider, code, state, redirectUri) {
        return (0, tracing_1.withOAuthSpan)('exchangeCode', provider, 'oauth-flow', async () => {
            const client = this.oauth2Clients.get(provider);
            if (!client)
                throw new errors_1.OAuthConfigError(`Provider ${provider} not configured`);
            const pkce = this.pkceStore.get(state);
            if (!pkce)
                throw new errors_1.OAuthError('Invalid or expired state parameter');
            // Check TTL
            if (Date.now() - pkce.createdAt > this.PKCE_TTL) {
                this.pkceStore.delete(state);
                throw new errors_1.OAuthError('PKCE challenge expired, restart authorization flow');
            }
            try {
                let tokenSet;
                // Use appropriate callback method based on whether nonce exists (OIDC vs OAuth2)
                if (pkce.nonce) {
                    // OpenID Connect (Google with discovery) - requires nonce validation
                    tokenSet = await client.callback(redirectUri, { code, state }, { code_verifier: pkce.codeVerifier, state, nonce: pkce.nonce });
                }
                else {
                    // Plain OAuth 2.0 (GitHub, Reddit, Twitter, Google with explicit endpoints) - no nonce
                    tokenSet = await client.oauthCallback(redirectUri, { code, state }, { code_verifier: pkce.codeVerifier, state });
                }
                this.pkceStore.delete(state);
                // Debug: Log token types (first 10 chars only for security)
                this.logger.debug('Token exchange successful', {
                    provider,
                    hasAccessToken: !!tokenSet.access_token,
                    hasRefreshToken: !!tokenSet.refresh_token,
                    hasIdToken: !!tokenSet.id_token,
                    accessTokenPrefix: tokenSet.access_token?.substring(0, 10),
                    tokenType: tokenSet.token_type,
                    expiresIn: tokenSet.expires_in,
                });
                return {
                    accessToken: tokenSet.access_token,
                    refreshToken: tokenSet.refresh_token,
                    expiresAt: tokenSet.expires_at ? new Date(tokenSet.expires_at * 1000) : undefined,
                    scope: tokenSet.scope,
                    tokenType: tokenSet.token_type,
                    idToken: tokenSet.id_token,
                };
            }
            catch (error) {
                this.logger.error('Token exchange failed', { provider, error });
                throw new errors_1.OAuthError('Failed to exchange authorization code', { cause: error });
            }
        });
    }
    /**
     * Refresh access token
     */
    async refreshToken(provider, refreshToken) {
        return (0, tracing_1.withOAuthSpan)('refreshToken', provider, 'oauth-flow', async () => {
            const client = this.oauth2Clients.get(provider);
            if (!client)
                throw new errors_1.OAuthConfigError(`Provider ${provider} not configured`);
            try {
                const tokenSet = await client.refresh(refreshToken);
                return {
                    accessToken: tokenSet.access_token,
                    refreshToken: tokenSet.refresh_token ?? refreshToken,
                    expiresAt: tokenSet.expires_at ? new Date(tokenSet.expires_at * 1000) : undefined,
                    scope: tokenSet.scope,
                    tokenType: tokenSet.token_type,
                };
            }
            catch (error) {
                this.logger.error('Token refresh failed', { provider, error: error.message });
                // CRITICAL FIX: Wrap in TokenRefreshError per LLD specification
                throw new errors_1.TokenRefreshError('Failed to refresh token', {
                    provider,
                    cause: error,
                    errorType: error.error ?? 'unknown',
                });
            }
        });
    }
    /**
     * Revoke token
     */
    async revokeToken(provider, token) {
        const client = this.oauth2Clients.get(provider);
        if (!client)
            return;
        try {
            await client.revoke(token);
            this.logger.info('Token revoked', { provider });
        }
        catch (error) {
            this.logger.warn('Token revocation failed', { provider, error });
        }
    }
    /**
     * Get provider configuration
     * CRITICAL FIX: Allow connectors to access provider config instead of env vars
     */
    getProviderConfig(provider) {
        const config = this.config[provider];
        if (!config) {
            throw new errors_1.OAuthConfigError(`Provider ${provider} not configured`);
        }
        return config;
    }
    async createOAuth2Client(provider, cfg) {
        let issuer;
        if (provider === 'google' && !cfg.authorizationEndpoint) {
            // Use OIDC discovery only if explicit endpoints are not provided
            issuer = await openid_client_1.Issuer.discover('https://accounts.google.com');
        }
        else if (cfg.authorizationEndpoint && cfg.tokenEndpoint) {
            issuer = new openid_client_1.Issuer({
                issuer: provider,
                authorization_endpoint: cfg.authorizationEndpoint,
                token_endpoint: cfg.tokenEndpoint,
                // Reddit requires client_secret_basic authentication
                token_endpoint_auth_methods_supported: provider === 'reddit'
                    ? ['client_secret_basic']
                    : ['client_secret_post', 'client_secret_basic'],
            });
        }
        else {
            // Add default OAuth2 endpoints for common providers
            let authEndpoint;
            let tokenEndpoint;
            switch (provider) {
                case 'github':
                    authEndpoint = 'https://github.com/login/oauth/authorize';
                    tokenEndpoint = 'https://github.com/login/oauth/access_token';
                    break;
                case 'twitter':
                case 'x':
                    authEndpoint = 'https://twitter.com/i/oauth2/authorize';
                    tokenEndpoint = 'https://api.twitter.com/2/oauth2/token';
                    break;
                default:
                    throw new errors_1.OAuthConfigError(`Cannot configure OAuth2 for ${provider} - missing authorization and token endpoints`);
            }
            issuer = new openid_client_1.Issuer({
                issuer: provider,
                authorization_endpoint: authEndpoint,
                token_endpoint: tokenEndpoint,
                token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
            });
        }
        const clientConfig = {
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            redirect_uris: [cfg.redirectUri],
            response_types: ['code'],
        };
        // Reddit requires client_secret_basic for token endpoint
        if (provider === 'reddit') {
            clientConfig.token_endpoint_auth_method = 'client_secret_basic';
        }
        return new issuer.Client(clientConfig);
    }
    generatePKCE() {
        const codeVerifier = openid_client_1.generators.codeVerifier();
        const codeChallenge = openid_client_1.generators.codeChallenge(codeVerifier);
        return {
            codeVerifier,
            codeChallenge,
            method: 'S256',
        };
    }
    cleanupExpiredChallenges() {
        const now = Date.now();
        for (const [state, challenge] of this.pkceStore.entries()) {
            if (now - challenge.createdAt > this.PKCE_TTL) {
                this.pkceStore.delete(state);
                this.logger.debug('Cleaned up expired PKCE challenge', { state });
            }
        }
    }
    // isOAuth2Config method removed - all providers are OAuth2 now
    destroy() {
        clearInterval(this.cleanupInterval);
    }
}
exports.AuthCore = AuthCore;
//# sourceMappingURL=AuthCore.js.map