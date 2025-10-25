import { BaseConnector } from '../BaseConnector';
import type { NormalizedItem } from '../../core/normalizer/types';
import type { RedditFetchParams } from './types';
/**
 * Reddit OAuth connector
 *
 * Supports fetching:
 * - User's saved posts/comments
 * - User's submitted posts
 * - User's comments
 * - Subreddit posts
 *
 * @example
 * ```typescript
 * const sdk = await ConnectorSDK.init(config);
 * await sdk.connect(userId, 'reddit', { scopes: ['identity', 'read', 'history'] });
 * const saved = await sdk.fetch(userId, 'reddit', { type: 'saved' });
 * ```
 */
export declare class RedditConnector extends BaseConnector {
    readonly name: "reddit";
    /**
     * Fetches data from Reddit API
     *
     * @param userId - User identifier
     * @param params - Reddit-specific fetch parameters
     * @returns Array of normalized items
     */
    fetch(userId: string, params?: RedditFetchParams): Promise<NormalizedItem[]>;
    /**
     * Get Reddit-specific OAuth parameters for authorization URL
     */
    getConnectOptions(options?: any): any;
    /**
     * Get redirect URI for Reddit OAuth
     */
    protected getRedirectUri(): string;
}
//# sourceMappingURL=RedditConnector.d.ts.map