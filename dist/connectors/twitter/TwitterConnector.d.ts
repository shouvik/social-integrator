import { BaseConnector } from '../BaseConnector';
import type { NormalizedItem } from '../../core/normalizer/types';
import type { TwitterFetchParams } from './types';
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
export declare class TwitterConnector extends BaseConnector {
    readonly name: "twitter";
    private readonly apiBaseUrl;
    /**
     * Fetches data from Twitter API v2
     *
     * @param userId - User identifier
     * @param params - Twitter-specific fetch parameters
     * @returns Array of normalized items
     */
    fetch(userId: string, params?: TwitterFetchParams): Promise<NormalizedItem[]>;
    /**
     * Get redirect URI for Twitter OAuth
     */
    protected getRedirectUri(): string;
}
//# sourceMappingURL=TwitterConnector.d.ts.map