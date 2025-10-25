import { BaseConnector } from '../BaseConnector';
import type { NormalizedItem } from '../../core/normalizer/types';
import type { RSSFetchParams } from './types';
/**
 * RSS feed connector (no OAuth required)
 *
 * Fetches and parses RSS/Atom feeds from any public URL.
 * Supports ETag caching to minimize bandwidth usage.
 *
 * @example
 * ```typescript
 * const sdk = await ConnectorSDK.init(config);
 * // RSS doesn't need OAuth, but we still track feed URLs per user
 * const items = await sdk.fetch(userId, 'rss', {
 *   feedUrl: 'https://example.com/feed.xml'
 * });
 * ```
 */
export declare class RSSConnector extends BaseConnector {
    readonly name: "rss";
    private parser;
    constructor(deps: any);
    /**
     * Fetches and parses an RSS feed
     *
     * @param userId - User identifier (for tracking/caching)
     * @param params - RSS-specific fetch parameters (feedUrl required)
     * @returns Array of normalized items
     */
    fetch(userId: string, params?: RSSFetchParams): Promise<NormalizedItem[]>;
    /**
     * RSS doesn't require OAuth - return empty auth URL
     *
     * @param userId - User identifier
     * @param opts - Connect options (unused for RSS)
     * @returns Empty string (no OAuth needed)
     */
    connect(userId: string, opts?: any): Promise<string>;
    /**
     * RSS doesn't require OAuth - return dummy token set
     *
     * @param userId - User identifier
     * @param params - Callback parameters (unused for RSS)
     * @returns Dummy token set
     */
    handleCallback(userId: string, params: URLSearchParams): Promise<any>;
    /**
     * Disconnects user (clears cached feed data)
     *
     * @param userId - User identifier
     */
    disconnect(userId: string): Promise<void>;
    /**
     * Get redirect URI (not used for RSS but required by base class)
     */
    protected getRedirectUri(): string;
    /**
     * Override getAccessToken since RSS doesn't need tokens
     */
    protected getAccessToken(_userId: string): Promise<string>;
    /**
     * Hash feed URL for consistent caching keys
     * Uses SHA-256 to prevent collisions
     */
    private hashFeedUrl;
}
//# sourceMappingURL=RSSConnector.d.ts.map