"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedditConnector = void 0;
const BaseConnector_1 = require("../BaseConnector");
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
class RedditConnector extends BaseConnector_1.BaseConnector {
    name = 'reddit';
    /**
     * Fetches data from Reddit API
     *
     * @param userId - User identifier
     * @param params - Reddit-specific fetch parameters
     * @returns Array of normalized items
     */
    async fetch(userId, params) {
        const accessToken = await this.getAccessToken(userId);
        const type = params?.type ?? 'saved';
        const limit = Math.min(params?.limit ?? 25, 100); // Reddit max is 100
        const sort = params?.sort ?? 'new';
        // Reddit requires a specific User-Agent format: platform:app_id:version (by /u/username)
        const userAgent = process.env.REDDIT_USER_AGENT || 'web:oauth-connector-sdk:v1.0.0 (by /u/oauth-connector)';
        // Build URL based on type
        let url;
        if (params?.subreddit) {
            // Subreddit-specific endpoint
            url = `https://oauth.reddit.com/r/${params.subreddit}/${sort}`;
        }
        else {
            // User-specific endpoints require the actual Reddit username
            // Reddit doesn't support /user/me/* - we must first get the username from /api/v1/me
            const meResponse = await this.deps.http.request({
                url: 'https://oauth.reddit.com/api/v1/me',
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': userAgent,
                },
            });
            const redditUsername = meResponse.data.name;
            this.deps.logger.debug('Reddit username retrieved', { userId, redditUsername });
            // Now build the correct endpoint with the actual username
            switch (type) {
                case 'saved':
                    url = `https://oauth.reddit.com/user/${redditUsername}/saved`;
                    break;
                case 'submitted':
                    url = `https://oauth.reddit.com/user/${redditUsername}/submitted`;
                    break;
                case 'comments':
                    url = `https://oauth.reddit.com/user/${redditUsername}/comments`;
                    break;
                default:
                    url = `https://oauth.reddit.com/user/${redditUsername}/saved`;
            }
        }
        // Build query parameters
        const queryParams = {
            limit: limit,
            raw_json: 1, // Avoid HTML entity encoding
        };
        if (params?.after)
            queryParams.after = params.after;
        if (params?.before)
            queryParams.before = params.before;
        if (params?.time && (sort === 'top' || sort === 'controversial')) {
            queryParams.t = params.time;
        }
        // For subreddit endpoints, add sort to query params
        if (params?.subreddit) {
            queryParams.sort = sort;
        }
        // Make request with ETag caching
        const response = await this.deps.http.request({
            url,
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': userAgent,
            },
            query: queryParams,
            etagKey: {
                userId,
                provider: this.name,
                resource: `${type}:${params?.subreddit ?? 'user'}:${sort}`,
            },
        });
        // Reddit always returns data, must normalize
        const listing = response.data;
        if (!listing?.data?.children) {
            return [];
        }
        // Extract raw items from Reddit's nested structure
        const rawItems = listing.data.children.map((child) => child.data);
        // Normalize using the centralized normalizer
        const normalized = this.deps.normalizer.normalize('reddit', userId, rawItems);
        this.deps.logger.info('Reddit fetch completed', {
            userId,
            type,
            itemCount: normalized.length,
            hasMore: !!listing.data.after,
        });
        return normalized;
    }
    /**
     * Get Reddit-specific OAuth parameters for authorization URL
     */
    getConnectOptions(options) {
        return {
            ...options,
            extraParams: {
                duration: 'permanent', // Required for refresh tokens
                ...options?.extraParams,
            },
        };
    }
    /**
     * Get redirect URI for Reddit OAuth
     */
    getRedirectUri() {
        const config = this.deps.auth.getProviderConfig(this.name);
        if (!('redirectUri' in config) || !config.redirectUri) {
            throw new Error(`No redirectUri configured for ${this.name}`);
        }
        return config.redirectUri;
    }
}
exports.RedditConnector = RedditConnector;
//# sourceMappingURL=RedditConnector.js.map