import type { FetchParams } from '../types';

/**
 * Reddit-specific fetch parameters
 */
export interface RedditFetchParams extends FetchParams {
  /**
   * Type of content to fetch
   * - 'saved': User's saved posts/comments
   * - 'submitted': User's submitted posts
   * - 'comments': User's comments
   */
  type?: 'saved' | 'submitted' | 'comments';
  
  /**
   * Subreddit to fetch from (optional, for subreddit-specific queries)
   */
  subreddit?: string;
  
  /**
   * Sorting method
   */
  sort?: 'hot' | 'new' | 'top' | 'controversial';
  
  /**
   * Time period for 'top' and 'controversial' sorts
   */
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  
  /**
   * Number of items per page (max 100)
   */
  limit?: number;
  
  /**
   * Pagination cursor (after/before)
   */
  after?: string;
  before?: string;
}

/**
 * Reddit API response for listing endpoints
 */
export interface RedditListingResponse {
  kind: 'Listing';
  data: {
    after: string | null;
    before: string | null;
    dist: number;
    modhash: string;
    geo_filter: string;
    children: Array<{
      kind: string;
      data: RedditPost | RedditComment;
    }>;
  };
}

/**
 * Reddit post data structure
 */
export interface RedditPost {
  id: string;
  name: string;
  title: string;
  selftext: string;
  selftext_html: string | null;
  author: string;
  subreddit: string;
  subreddit_name_prefixed: string;
  created_utc: number;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  thumbnail: string;
  is_self: boolean;
  link_flair_text: string | null;
}

/**
 * Reddit comment data structure
 */
export interface RedditComment {
  id: string;
  name: string;
  body: string;
  body_html: string;
  author: string;
  subreddit: string;
  created_utc: number;
  permalink: string;
  score: number;
  link_id: string;
  link_title?: string;
  link_permalink?: string;
  parent_id: string;
}

