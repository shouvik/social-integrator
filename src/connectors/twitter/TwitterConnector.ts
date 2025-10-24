import { BaseConnector } from '../BaseConnector';
import type { NormalizedItem } from '../../core/normalizer/types';
import type { TwitterFetchParams, TwitterTweetResponse } from './types';

/**
 * Twitter (X) OAuth connector
 * 
 * Supports OAuth 2.0 using Twitter API v2 for data fetching.
 * 
 * **Features:**
 * - OAuth 2.0 with PKCE
 * - Read access to tweets, user data, and timelines
 * - ETag caching support
 * - Automatic token refresh
 * 
 * **Note:** OAuth 1.0a is not currently supported. Use OAuth 2.0 with
 * appropriate scopes for your use case.
 * 
 * @example
 * ```typescript
 * const sdk = await ConnectorSDK.init(config);
 * 
 * // Connect with OAuth 2.0
 * await sdk.connect(userId, 'twitter', { 
 *   scopes: ['tweet.read', 'users.read', 'offline.access'] 
 * });
 * 
 * // Fetch timeline
 * const tweets = await sdk.fetch(userId, 'twitter', { type: 'timeline' });
 * ```
 */
export class TwitterConnector extends BaseConnector {
  readonly name = 'twitter' as const;
  private readonly apiBaseUrl = 'https://api.twitter.com/2';

  /**
   * Fetches data from Twitter API v2
   * 
   * @param userId - User identifier
   * @param params - Twitter-specific fetch parameters
   * @returns Array of normalized items
   */
  async fetch(userId: string, params?: TwitterFetchParams): Promise<NormalizedItem[]> {
    const accessToken = await this.getAccessToken(userId);
    
    const type = params?.type ?? 'timeline';
    const maxResults = Math.min(params?.maxResults ?? 25, 100); // Twitter API v2 max is 100
    
    // Build URL based on type
    let url: string;
    const queryParams: Record<string, string> = {
      max_results: maxResults.toString(),
      'tweet.fields': 'created_at,author_id,public_metrics,referenced_tweets,attachments,entities',
      'user.fields': 'username,name,profile_image_url',
      'expansions': 'author_id,attachments.media_keys',
    };
    
    switch (type) {
      case 'timeline':
        // Reverse chronological home timeline
        url = `${this.apiBaseUrl}/users/me/timelines/reverse_chronological`;
        break;
      case 'mentions':
        // Tweets mentioning the user
        url = `${this.apiBaseUrl}/users/me/mentions`;
        break;
      case 'tweets':
        // User's own tweets
        url = `${this.apiBaseUrl}/users/me/tweets`;
        if (params?.excludeRetweets) {
          queryParams.exclude = 'retweets';
        }
        if (params?.excludeReplies) {
          queryParams.exclude = queryParams.exclude 
            ? `${queryParams.exclude},replies` 
            : 'replies';
        }
        break;
      case 'search':
        if (!params?.query) {
          throw new Error('Twitter search requires a query parameter');
        }
        url = `${this.apiBaseUrl}/tweets/search/recent`;
        queryParams.query = params.query;
        break;
      default:
        url = `${this.apiBaseUrl}/users/me/tweets`;
    }
    
    // Add pagination token if provided
    if (params?.paginationToken) {
      queryParams.pagination_token = params.paginationToken;
    }
    
    // Make request with ETag caching
    const response = await this.deps.http.request<TwitterTweetResponse>({
      url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'oauth-connector-sdk/1.0',
      },
      query: queryParams,
      etagKey: { 
        userId, 
        provider: this.name, 
        resource: `${type}:${params?.query ?? 'user'}` 
      },
    });
    
    // Twitter may return empty data
    const twitterResponse = response.data;
    if (!twitterResponse?.data || twitterResponse.data.length === 0) {
      return [];
    }
    
    // Handle API errors
    if (twitterResponse.errors && twitterResponse.errors.length > 0) {
      this.deps.logger.warn('Twitter API returned errors', {
        userId,
        errors: twitterResponse.errors,
      });
    }
    
    // Normalize tweets
    const rawTweets = twitterResponse.data;
    const normalized = this.deps.normalizer.normalize('twitter', userId, rawTweets);
    
    this.deps.logger.info('Twitter fetch completed', {
      userId,
      type,
      tweetCount: normalized.length,
      hasMore: !!twitterResponse.meta?.next_token,
    });
    
    return normalized;
  }

  /**
   * Get redirect URI for Twitter OAuth
   */
  protected getRedirectUri(): string {
    const uri = process.env.TWITTER_REDIRECT_URI;
    if (!uri) {
      throw new Error('TWITTER_REDIRECT_URI environment variable is required');
    }
    return uri;
  }
}

