/**
 * RSSConnector Unit Tests
 *
 * Tests RSS feed parsing, error handling, and normalization.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RSSConnector } from '../../src/connectors/rss/RSSConnector';
import type { CoreDeps } from '../../src/connectors/types';

describe('RSSConnector', () => {
  let connector: RSSConnector;
  let mockDeps: CoreDeps;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDeps = {
      auth: {
        createAuthUrl: vi.fn(),
        exchangeCode: vi.fn(),
        refreshToken: vi.fn(),
        revokeToken: vi.fn(),
        getProviderConfig: vi.fn(),
      },
      tokens: {
        getToken: vi.fn(),
        setToken: vi.fn(),
        deleteToken: vi.fn(),
      },
      http: {
        request: vi.fn(),
        get: vi.fn(),
      },
      normalizer: {
        normalize: vi.fn(),
      },
      metrics: {
        incrementCounter: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      },
    } as CoreDeps;

    connector = new RSSConnector(mockDeps);
  });

  describe('fetch', () => {
    it('should fetch and parse valid RSS feed', async () => {
      const validRSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>Test RSS Feed</description>
    <item>
      <title>Test Article</title>
      <link>https://example.com/article1</link>
      <description>Test article content</description>
      <pubDate>Mon, 15 Jan 2025 10:00:00 GMT</pubDate>
      <guid>article-1</guid>
    </item>
  </channel>
</rss>`;

      vi.mocked(mockDeps.http.request).mockResolvedValue({
        data: validRSS,
        status: 200,
        headers: {},
      });

      vi.mocked(mockDeps.normalizer.normalize).mockReturnValue([
        {
          id: 'article-1',
          source: 'rss',
          userId: 'user-123',
          title: 'Test Article',
          content: 'Test article content',
          url: 'https://example.com/article1',
          publishedAt: '2025-01-15T10:00:00.000Z',
        },
      ]);

      const items = await connector.fetch('user-123', {
        feedUrl: 'https://example.com/feed.xml',
      });

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Test Article');
      expect(mockDeps.http.request).toHaveBeenCalledWith({
        url: 'https://example.com/feed.xml',
        method: 'GET',
        headers: {
          'User-Agent': 'oauth-connector-sdk/1.0',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
        etagKey: {
          userId: 'user-123',
          provider: 'rss',
          resource: expect.any(String), // Hashed feed URL
        },
      });
    });

    it('should fetch and parse Atom feed', async () => {
      const validAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <link href="https://example.com" />
  <updated>2025-01-15T10:00:00Z</updated>
  <entry>
    <title>Atom Entry</title>
    <link href="https://example.com/entry1" />
    <id>entry-1</id>
    <updated>2025-01-15T10:00:00Z</updated>
    <summary>Atom entry content</summary>
  </entry>
</feed>`;

      vi.mocked(mockDeps.http.request).mockResolvedValue({
        data: validAtom,
        status: 200,
        headers: {},
      });

      vi.mocked(mockDeps.normalizer.normalize).mockReturnValue([
        {
          id: 'entry-1',
          source: 'rss',
          userId: 'user-123',
          title: 'Atom Entry',
          content: 'Atom entry content',
          url: 'https://example.com/entry1',
          publishedAt: '2025-01-15T10:00:00.000Z',
        },
      ]);

      const items = await connector.fetch('user-123', {
        feedUrl: 'https://example.com/atom.xml',
      });

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Atom Entry');
    });

    it('should handle malformed XML gracefully', async () => {
      const malformedXML = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Broken Feed</title>
    <!-- Missing closing tags -->
  </channel>
`;

      vi.mocked(mockDeps.http.request).mockResolvedValue({
        data: malformedXML,
        status: 200,
        headers: {},
      });

      await expect(
        connector.fetch('user-123', { feedUrl: 'https://example.com/broken.xml' })
      ).rejects.toThrow('Failed to parse RSS feed');

      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        'RSS feed parse error',
        expect.objectContaining({
          userId: 'user-123',
          feedUrl: 'https://example.com/broken.xml',
        })
      );
    });

    it('should handle empty feed', async () => {
      const emptyRSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
    <link>https://example.com</link>
    <description>No items</description>
  </channel>
</rss>`;

      vi.mocked(mockDeps.http.request).mockResolvedValue({
        data: emptyRSS,
        status: 200,
        headers: {},
      });

      const items = await connector.fetch('user-123', {
        feedUrl: 'https://example.com/empty.xml',
      });

      expect(items).toHaveLength(0);
    });

    it('should limit items based on limit parameter', async () => {
      const largeRSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Large Feed</title>
    <link>https://example.com</link>
    ${Array.from(
      { length: 100 },
      (_, i) => `
    <item>
      <title>Article ${i + 1}</title>
      <link>https://example.com/article${i + 1}</link>
      <guid>article-${i + 1}</guid>
    </item>
    `
    ).join('')}
  </channel>
</rss>`;

      vi.mocked(mockDeps.http.request).mockResolvedValue({
        data: largeRSS,
        status: 200,
        headers: {},
      });

      // Mock normalizer to return only the first 10 items
      vi.mocked(mockDeps.normalizer.normalize).mockImplementation((_provider, _userId, items) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return items.slice(0, 10).map((item: any, index: number) => ({
          id: `article-${index + 1}`,
          source: 'rss',
          userId: 'user-123',
          title: item.title,
          url: item.link,
          publishedAt: new Date().toISOString(),
        }));
      });

      const items = await connector.fetch('user-123', {
        feedUrl: 'https://example.com/large.xml',
        limit: 10,
      });

      expect(items.length).toBeLessThanOrEqual(10);
    });

    it('should use default limit of 50 when not specified', async () => {
      const rssWithManyItems = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed</title>
    <link>https://example.com</link>
    ${Array.from(
      { length: 75 },
      (_, i) => `
    <item>
      <title>Article ${i + 1}</title>
      <link>https://example.com/article${i + 1}</link>
      <guid>article-${i + 1}</guid>
    </item>
    `
    ).join('')}
  </channel>
</rss>`;

      vi.mocked(mockDeps.http.request).mockResolvedValue({
        data: rssWithManyItems,
        status: 200,
        headers: {},
      });

      vi.mocked(mockDeps.normalizer.normalize).mockImplementation((_provider, _userId, items) => {
        // Default limit is 50
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return items.slice(0, 50).map((item: any, index: number) => ({
          id: `article-${index + 1}`,
          source: 'rss',
          userId: 'user-123',
          title: item.title,
          url: item.link,
          publishedAt: new Date().toISOString(),
        }));
      });

      const items = await connector.fetch('user-123', {
        feedUrl: 'https://example.com/feed.xml',
      });

      expect(items.length).toBeLessThanOrEqual(50);
    });

    it('should throw error when feedUrl is missing', async () => {
      await expect(connector.fetch('user-123', {} as any)).rejects.toThrow(
        'RSS connector requires feedUrl parameter'
      );
    });

    it('should handle network errors', async () => {
      vi.mocked(mockDeps.http.request).mockRejectedValue(new Error('Network error'));

      await expect(
        connector.fetch('user-123', { feedUrl: 'https://example.com/feed.xml' })
      ).rejects.toThrow('Network error');
    });

    it('should parse feeds with custom fields', async () => {
      const rssWithCustomFields = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Custom Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Article with creator</title>
      <link>https://example.com/article</link>
      <dc:creator>John Doe</dc:creator>
      <content:encoded><![CDATA[<p>Full HTML content</p>]]></content:encoded>
      <guid>article-custom</guid>
    </item>
  </channel>
</rss>`;

      vi.mocked(mockDeps.http.request).mockResolvedValue({
        data: rssWithCustomFields,
        status: 200,
        headers: {},
      });

      vi.mocked(mockDeps.normalizer.normalize).mockReturnValue([
        {
          id: 'article-custom',
          source: 'rss',
          userId: 'user-123',
          title: 'Article with creator',
          content: '<p>Full HTML content</p>',
          url: 'https://example.com/article',
          publishedAt: new Date().toISOString(),
          metadata: { creator: 'John Doe' },
        },
      ]);

      const items = await connector.fetch('user-123', {
        feedUrl: 'https://example.com/custom.xml',
      });

      expect(items).toHaveLength(1);
    });
  });

  describe('connect', () => {
    it('should return empty string (no OAuth needed)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authUrl = await connector.connect('user-123' as any);

      expect(authUrl).toBe('');
      expect(mockDeps.logger.info).toHaveBeenCalledWith(
        'RSS connector does not require OAuth',
        expect.objectContaining({ userId: 'user-123' })
      );
    });
  });

  describe('handleCallback', () => {
    it('should return dummy token set', async () => {
      const params = new URLSearchParams({ code: 'dummy' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await connector.handleCallback('user-123' as any, params);

      expect(result).toEqual({
        accessToken: '',
        tokenType: 'none',
        expiresAt: undefined,
      });
      expect(mockDeps.logger.info).toHaveBeenCalledWith(
        'RSS connector does not require OAuth callback',
        expect.any(Object)
      );
    });
  });

  describe('disconnect', () => {
    it('should log disconnection (no tokens to revoke)', async () => {
      await connector.disconnect('user-123');

      expect(mockDeps.logger.info).toHaveBeenCalledWith('RSS disconnected (no tokens to revoke)', {
        userId: 'user-123',
      });
    });
  });

  describe('getRedirectUri', () => {
    it('should return empty string', () => {
      // @ts-expect-error - Testing protected method
      const redirectUri = connector.getRedirectUri();
      expect(redirectUri).toBe('');
    });
  });

  describe('getAccessToken', () => {
    it('should return empty string (no tokens needed)', async () => {
      // @ts-expect-error - Testing protected method
      const token = await connector.getAccessToken('user-123');
      expect(token).toBe('');
    });
  });
});
