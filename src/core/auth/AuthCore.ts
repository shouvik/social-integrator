// src/core/auth/AuthCore.ts

import { Issuer, Client, generators } from 'openid-client';
import type { OAuth2Config, OAuth1Config, PKCEChallenge, ConnectOptions } from './types';
import type { ProviderName } from '../normalizer/types';
import type { TokenSet } from '../token/types';
import type { Logger } from '../../observability/Logger';
import { OAuthError, OAuthConfigError, TokenRefreshError } from '../../utils/errors';

export class AuthCore {
  private oauth2Clients: Map<ProviderName, Client> = new Map();
  private pkceStore: Map<string, PKCEChallenge & { createdAt: number }> = new Map();
  private readonly PKCE_TTL = 600000; // 10 minutes
  private cleanupInterval: NodeJS.Timeout;
  private logger: Logger;
  
  constructor(
    private config: Record<ProviderName, OAuth2Config | OAuth1Config>,
    logger: Logger
  ) {
    this.logger = logger;
    
    // Periodic cleanup of expired PKCE challenges
    this.cleanupInterval = setInterval(() => this.cleanupExpiredChallenges(), 60000);
  }
  
  /**
   * Initialize OAuth2 clients (discover endpoints)
   */
  async initialize(): Promise<void> {
    for (const [provider, cfg] of Object.entries(this.config)) {
      if (this.isOAuth2Config(cfg)) {
        const client = await this.createOAuth2Client(provider as ProviderName, cfg);
        this.oauth2Clients.set(provider as ProviderName, client);
      }
    }
    this.logger.info('AuthCore initialized', { providers: Array.from(this.oauth2Clients.keys()) });
  }
  
  /**
   * Create authorization URL with PKCE
   */
  createAuthUrl(provider: ProviderName, userId: string, opts?: ConnectOptions): string {
    const client = this.oauth2Clients.get(provider);
    if (!client) throw new OAuthConfigError(`Provider ${provider} not configured`);

    const state = opts?.state ?? generators.state();
    const pkce = this.generatePKCE();

    // Generate nonce only for OIDC providers (Google, etc.)
    // Non-OIDC providers (GitHub, Reddit, Twitter) don't use nonce
    const isOIDC = provider === 'google'; // TODO: Make this configurable
    const nonce = isOIDC ? generators.nonce() : undefined;

    // Store PKCE and nonce (if applicable) for later validation
    this.pkceStore.set(state, { ...pkce, nonce, createdAt: Date.now() });

    const authParams: Record<string, any> = {
      scope: (this.config[provider] as OAuth2Config).scopes.join(' '),
      state,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.method,
      ...opts?.extraParams
    };

    // Only add nonce for OIDC providers
    if (nonce) {
      authParams.nonce = nonce;
    }

    const authUrl = client.authorizationUrl(authParams);

    this.logger.debug('Created auth URL', { provider, userId, state });
    return authUrl;
  }
  
  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    provider: ProviderName,
    code: string,
    state: string,
    redirectUri: string
  ): Promise<TokenSet> {
    const client = this.oauth2Clients.get(provider);
    if (!client) throw new OAuthConfigError(`Provider ${provider} not configured`);

    const pkce = this.pkceStore.get(state);
    if (!pkce) throw new OAuthError('Invalid or expired state parameter');
    
    // Check TTL
    if (Date.now() - pkce.createdAt > this.PKCE_TTL) {
      this.pkceStore.delete(state);
      throw new OAuthError('PKCE challenge expired, restart authorization flow');
    }
    
    try {
      let tokenSet;

      // Use appropriate callback method based on whether nonce exists (OIDC vs OAuth2)
      if (pkce.nonce) {
        // OpenID Connect (Google, etc.) - requires nonce validation
        tokenSet = await client.callback(
          redirectUri,
          { code, state },
          { code_verifier: pkce.codeVerifier, state, nonce: pkce.nonce }
        );
      } else {
        // Plain OAuth 2.0 (GitHub, etc.) - no nonce
        tokenSet = await client.oauthCallback(
          redirectUri,
          { code, state },
          { code_verifier: pkce.codeVerifier, state }
        );
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
        expiresIn: tokenSet.expires_in
      });

      return {
        accessToken: tokenSet.access_token!,
        refreshToken: tokenSet.refresh_token,
        expiresAt: tokenSet.expires_at ? new Date(tokenSet.expires_at * 1000) : undefined,
        scope: tokenSet.scope,
        tokenType: tokenSet.token_type,
        idToken: tokenSet.id_token
      };
    } catch (error) {
      this.logger.error('Token exchange failed', { provider, error });
      throw new OAuthError('Failed to exchange authorization code', { cause: error });
    }
  }
  
  /**
   * Refresh access token
   */
  async refreshToken(provider: ProviderName, refreshToken: string): Promise<TokenSet> {
    const client = this.oauth2Clients.get(provider);
    if (!client) throw new OAuthConfigError(`Provider ${provider} not configured`);
    
    try {
      const tokenSet = await client.refresh(refreshToken);
      
      return {
        accessToken: tokenSet.access_token!,
        refreshToken: tokenSet.refresh_token ?? refreshToken,
        expiresAt: tokenSet.expires_at ? new Date(tokenSet.expires_at * 1000) : undefined,
        scope: tokenSet.scope,
        tokenType: tokenSet.token_type
      };
    } catch (error: any) {
      this.logger.error('Token refresh failed', { provider, error: error.message });
      
      // CRITICAL FIX: Wrap in TokenRefreshError per LLD specification
      throw new TokenRefreshError('Failed to refresh token', {
        provider,
        cause: error,
        errorType: error.error ?? 'unknown'
      });
    }
  }
  
  /**
   * Revoke token
   */
  async revokeToken(provider: ProviderName, token: string): Promise<void> {
    const client = this.oauth2Clients.get(provider);
    if (!client) return;
    
    try {
      await client.revoke(token);
      this.logger.info('Token revoked', { provider });
    } catch (error) {
      this.logger.warn('Token revocation failed', { provider, error });
    }
  }
  
  private async createOAuth2Client(provider: ProviderName, cfg: OAuth2Config): Promise<Client> {
    let issuer: Issuer;

    if (provider === 'google') {
      issuer = await Issuer.discover('https://accounts.google.com');
    } else if (cfg.authorizationEndpoint && cfg.tokenEndpoint) {
      issuer = new Issuer({
        issuer: provider,
        authorization_endpoint: cfg.authorizationEndpoint,
        token_endpoint: cfg.tokenEndpoint,
        // Reddit requires client_secret_basic authentication
        token_endpoint_auth_methods_supported: provider === 'reddit'
          ? ['client_secret_basic']
          : ['client_secret_post', 'client_secret_basic']
      });
    } else {
      throw new OAuthConfigError(`Cannot configure OAuth2 for ${provider}`);
    }

    const clientConfig: any = {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uris: [cfg.redirectUri],
      response_types: ['code']
    };

    // Reddit requires client_secret_basic for token endpoint
    if (provider === 'reddit') {
      clientConfig.token_endpoint_auth_method = 'client_secret_basic';
    }

    return new issuer.Client(clientConfig);
  }
  
  private generatePKCE(): PKCEChallenge {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    return {
      codeVerifier,
      codeChallenge,
      method: 'S256'
    };
  }
  
  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [state, challenge] of this.pkceStore.entries()) {
      if (now - challenge.createdAt > this.PKCE_TTL) {
        this.pkceStore.delete(state);
        this.logger.debug('Cleaned up expired PKCE challenge', { state });
      }
    }
  }
  
  private isOAuth2Config(cfg: OAuth2Config | OAuth1Config): cfg is OAuth2Config {
    return 'clientId' in cfg;
  }
  
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

