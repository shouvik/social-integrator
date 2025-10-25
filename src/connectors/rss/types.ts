import type { FetchParams } from '../types';

/**
 * RSS-specific fetch parameters
 */
export interface RSSFetchParams extends FetchParams {
  /**
   * RSS feed URL to fetch
   */
  feedUrl: string;

  /**
   * Maximum number of items to return
   */
  limit?: number;
}

/**
 * Raw RSS feed item from rss-parser
 */
export interface RSSFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  author?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  isoDate?: string;
  categories?: string[];
  enclosure?: {
    url: string;
    type: string;
    length?: string;
  };
}
