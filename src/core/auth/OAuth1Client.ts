import crypto from 'crypto';
import axios from 'axios';
import type { Logger } from '../../observability/Logger';
import { OAuthError } from '../../utils/errors';

/**
 * OAuth1 configuration for a provider
 */
export interface OAuth1Config {
  consumerKey: string;
  consumerSecret: string;
  requestTokenUrl: string;
  authorizeUrl: string;
  accessTokenUrl: string;
  signatureMethod?: 'HMAC-SHA1' | 'HMAC-SHA256';
  version?: '1.0' | '1.0a';
}

/**
 * OAuth1 request token response
 */
export interface OAuth1RequestToken {
  token: string;
  tokenSecret: string;
  callbackConfirmed?: boolean;
}

/**
 * OAuth1 access token response
 */
export interface OAuth1AccessToken {
  token: string;
  tokenSecret: string;
  userId?: string;
  screenName?: string;
}

/**
 * OAuth 1.0a client implementation
 * 
 * Implements the three-legged OAuth 1.0a flow with HMAC-SHA1 signatures.
 * Used primarily for Twitter API (X API).
 * 
 * @example
 * ```typescript
 * const oauth1 = new OAuth1Client(config, logger);
 * const { authUrl, requestToken } = await oauth1.getAuthorizationUrl(callbackUrl);
 * // ... user authorizes ...
 * const accessToken = await oauth1.getAccessToken(requestToken, verifier);
 * ```
 */
export class OAuth1Client {
  private config: OAuth1Config;
  private logger: Logger;

  constructor(config: OAuth1Config, logger: Logger) {
    this.config = {
      signatureMethod: 'HMAC-SHA1',
      version: '1.0a',
      ...config,
    };
    this.logger = logger;
  }

  /**
   * Step 1: Get request token and authorization URL
   * 
   * @param callbackUrl - OAuth callback URL
   * @returns Authorization URL and request token
   */
  async getAuthorizationUrl(callbackUrl: string): Promise<{
    authUrl: string;
    requestToken: OAuth1RequestToken;
  }> {
    try {
      // Generate OAuth parameters
      const oauthParams = {
        oauth_callback: callbackUrl,
        oauth_consumer_key: this.config.consumerKey,
        oauth_nonce: this.generateNonce(),
        oauth_signature_method: this.config.signatureMethod!,
        oauth_timestamp: this.getTimestamp(),
        oauth_version: this.config.version!,
      };

      // Generate signature
      const signature = this.generateSignature(
        'POST',
        this.config.requestTokenUrl,
        oauthParams,
        '',
      );

      // Build Authorization header
      const authHeader = this.buildAuthHeader({
        ...oauthParams,
        oauth_signature: signature,
      });

      // Request token
      const response = await axios.post(
        this.config.requestTokenUrl,
        null,
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // Parse response
      const params = this.parseQueryString(response.data);
      const requestToken: OAuth1RequestToken = {
        token: params.oauth_token || '',
        tokenSecret: params.oauth_token_secret || '',
        callbackConfirmed: params.oauth_callback_confirmed === 'true',
      };

      if (!requestToken.token || !requestToken.tokenSecret) {
        throw new OAuthError('Invalid request token response', {
          provider: 'oauth1',
          errorType: 'invalid_response',
        });
      }

      // Build authorization URL
      const authUrl = `${this.config.authorizeUrl}?oauth_token=${requestToken.token}`;

      this.logger.info('OAuth1 request token obtained', {
        tokenLength: requestToken.token.length,
        callbackConfirmed: requestToken.callbackConfirmed,
      });

      return { authUrl, requestToken };
    } catch (error: any) {
      this.logger.error('OAuth1 request token failed', {
        error: error.message,
        url: this.config.requestTokenUrl,
      });
      throw new OAuthError('Failed to get OAuth1 request token', {
        provider: 'oauth1',
        cause: error,
        errorType: 'request_token_failed',
      });
    }
  }

  /**
   * Step 3: Exchange request token + verifier for access token
   * 
   * @param requestToken - Request token from step 1
   * @param verifier - OAuth verifier from callback
   * @returns Access token
   */
  async getAccessToken(
    requestToken: OAuth1RequestToken,
    verifier: string
  ): Promise<OAuth1AccessToken> {
    try {
      // Generate OAuth parameters
      const oauthParams = {
        oauth_consumer_key: this.config.consumerKey,
        oauth_nonce: this.generateNonce(),
        oauth_signature_method: this.config.signatureMethod!,
        oauth_timestamp: this.getTimestamp(),
        oauth_token: requestToken.token,
        oauth_verifier: verifier,
        oauth_version: this.config.version!,
      };

      // Generate signature
      const signature = this.generateSignature(
        'POST',
        this.config.accessTokenUrl,
        oauthParams,
        requestToken.tokenSecret
      );

      // Build Authorization header
      const authHeader = this.buildAuthHeader({
        ...oauthParams,
        oauth_signature: signature,
      });

      // Request access token
      const response = await axios.post(
        this.config.accessTokenUrl,
        null,
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // Parse response
      const params = this.parseQueryString(response.data);
      const accessToken: OAuth1AccessToken = {
        token: params.oauth_token || '',
        tokenSecret: params.oauth_token_secret || '',
        userId: params.user_id,
        screenName: params.screen_name,
      };

      if (!accessToken.token || !accessToken.tokenSecret) {
        throw new OAuthError('Invalid access token response', {
          provider: 'oauth1',
          errorType: 'invalid_response',
        });
      }

      this.logger.info('OAuth1 access token obtained', {
        userId: accessToken.userId,
        screenName: accessToken.screenName,
      });

      return accessToken;
    } catch (error: any) {
      this.logger.error('OAuth1 access token failed', {
        error: error.message,
        url: this.config.accessTokenUrl,
      });
      throw new OAuthError('Failed to get OAuth1 access token', {
        provider: 'oauth1',
        cause: error,
        errorType: 'access_token_failed',
      });
    }
  }

  /**
   * Sign an OAuth1 request
   * 
   * @param method - HTTP method
   * @param url - Request URL
   * @param params - Request parameters
   * @param token - Access token
   * @param tokenSecret - Token secret
   * @returns Authorization header value
   */
  signRequest(
    method: string,
    url: string,
    params: Record<string, string>,
    token: string,
    tokenSecret: string
  ): string {
    const oauthParams = {
      oauth_consumer_key: this.config.consumerKey,
      oauth_nonce: this.generateNonce(),
      oauth_signature_method: this.config.signatureMethod!,
      oauth_timestamp: this.getTimestamp(),
      oauth_token: token,
      oauth_version: this.config.version!,
      ...params,
    };

    const signature = this.generateSignature(
      method,
      url,
      oauthParams,
      tokenSecret
    );

    return this.buildAuthHeader({
      ...oauthParams,
      oauth_signature: signature,
    });
  }

  /**
   * Generate OAuth signature using HMAC-SHA1
   */
  private generateSignature(
    method: string,
    url: string,
    params: Record<string, string>,
    tokenSecret: string
  ): string {
    // 1. Create parameter string
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${this.percentEncode(key)}=${this.percentEncode(params[key])}`)
      .join('&');

    // 2. Create base string
    const baseString = [
      method.toUpperCase(),
      this.percentEncode(url),
      this.percentEncode(sortedParams),
    ].join('&');

    // 3. Create signing key
    const signingKey = [
      this.percentEncode(this.config.consumerSecret),
      this.percentEncode(tokenSecret),
    ].join('&');

    // 4. Generate signature
    const algorithm = this.config.signatureMethod === 'HMAC-SHA256' ? 'sha256' : 'sha1';
    const signature = crypto
      .createHmac(algorithm, signingKey)
      .update(baseString)
      .digest('base64');

    return signature;
  }

  /**
   * Build OAuth Authorization header
   */
  private buildAuthHeader(params: Record<string, string>): string {
    const oauthParams = Object.keys(params)
      .filter(key => key.startsWith('oauth_'))
      .sort()
      .map(key => `${this.percentEncode(key)}="${this.percentEncode(params[key])}"`)
      .join(', ');

    return `OAuth ${oauthParams}`;
  }

  /**
   * Percent-encode for OAuth (RFC 3986)
   */
  private percentEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  }

  /**
   * Generate random nonce
   */
  private generateNonce(): string {
    return crypto.randomBytes(16).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  /**
   * Get current Unix timestamp
   */
  private getTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
  }

  /**
   * Parse query string into object
   */
  private parseQueryString(str: string): Record<string, string> {
    const params: Record<string, string> = {};
    const pairs = str.split('&');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
    
    return params;
  }
}

