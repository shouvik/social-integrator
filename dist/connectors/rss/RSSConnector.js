"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RSSConnector = void 0;
const rss_parser_1 = __importDefault(require("rss-parser"));
const crypto_1 = __importDefault(require("crypto"));
const BaseConnector_1 = require("../BaseConnector");
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
class RSSConnector extends BaseConnector_1.BaseConnector {
    name = 'rss';
    parser;
    constructor(deps) {
        super(deps);
        this.parser = new rss_parser_1.default({
            customFields: {
                item: ['creator', 'author', 'content:encoded', 'media:thumbnail'],
            },
        });
    }
    /**
     * Fetches and parses an RSS feed
     *
     * @param userId - User identifier (for tracking/caching)
     * @param params - RSS-specific fetch parameters (feedUrl required)
     * @returns Array of normalized items
     */
    async fetch(userId, params) {
        if (!params?.feedUrl) {
            throw new Error('RSS connector requires feedUrl parameter');
        }
        const limit = params.limit ?? 50;
        // Fetch feed with ETag caching (RSS feeds often support ETags)
        const response = await this.deps.http.request({
            url: params.feedUrl,
            method: 'GET',
            headers: {
                'User-Agent': 'oauth-connector-sdk/1.0',
                Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
            },
            etagKey: {
                userId,
                provider: this.name,
                resource: this.hashFeedUrl(params.feedUrl),
            },
        });
        // Parse RSS/Atom feed
        let feed;
        try {
            feed = await this.parser.parseString(response.data);
        }
        catch (error) {
            this.deps.logger.error('RSS feed parse error', {
                userId,
                feedUrl: params.feedUrl,
                error: error.message,
            });
            throw new Error(`Failed to parse RSS feed: ${error.message}`);
        }
        if (!feed.items || feed.items.length === 0) {
            return [];
        }
        // Limit items
        const rawItems = feed.items.slice(0, limit);
        // Normalize using the centralized normalizer
        const normalized = this.deps.normalizer.normalize('rss', userId, rawItems);
        this.deps.logger.info('RSS fetch completed', {
            userId,
            feedUrl: params.feedUrl,
            itemCount: normalized.length,
            feedTitle: feed.title,
        });
        return normalized;
    }
    /**
     * RSS doesn't require OAuth - return empty auth URL
     *
     * @param userId - User identifier
     * @param opts - Connect options (unused for RSS)
     * @returns Empty string (no OAuth needed)
     */
    async connect(userId, opts) {
        this.deps.logger.info('RSS connector does not require OAuth', { userId, opts });
        return ''; // No auth URL needed for RSS
    }
    /**
     * RSS doesn't require OAuth - return dummy token set
     *
     * @param userId - User identifier
     * @param params - Callback parameters (unused for RSS)
     * @returns Dummy token set
     */
    async handleCallback(userId, params) {
        this.deps.logger.info('RSS connector does not require OAuth callback', {
            userId,
            params: params.toString(),
        });
        // Return minimal token set (RSS doesn't use tokens)
        return {
            accessToken: '',
            tokenType: 'none',
            expiresAt: undefined,
        };
    }
    /**
     * Disconnects user (clears cached feed data)
     *
     * @param userId - User identifier
     */
    async disconnect(userId) {
        // No tokens to delete for RSS, but we log it
        this.deps.logger.info('RSS disconnected (no tokens to revoke)', { userId });
    }
    /**
     * Get redirect URI (not used for RSS but required by base class)
     */
    getRedirectUri() {
        return '';
    }
    /**
     * Override getAccessToken since RSS doesn't need tokens
     */
    async getAccessToken(_userId) {
        // RSS doesn't use access tokens
        return '';
    }
    /**
     * Hash feed URL for consistent caching keys
     * Uses SHA-256 to prevent collisions
     */
    hashFeedUrl(url) {
        return crypto_1.default.createHash('sha256').update(url).digest('hex').substring(0, 16); // Use first 16 hex chars for compact cache key
    }
}
exports.RSSConnector = RSSConnector;
//# sourceMappingURL=RSSConnector.js.map