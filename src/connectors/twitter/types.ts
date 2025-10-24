import type { FetchParams } from '../types';

/**
 * Twitter-specific fetch parameters
 */
export interface TwitterFetchParams extends FetchParams {
  /**
   * Type of content to fetch
   * - 'timeline': User's timeline (home feed)
   * - 'mentions': Tweets mentioning the user
   * - 'tweets': User's own tweets
   * - 'search': Search tweets
   */
  type?: 'timeline' | 'mentions' | 'tweets' | 'search';
  
  /**
   * Search query (required if type is 'search')
   */
  query?: string;
  
  /**
   * User ID to fetch tweets from (optional, defaults to authenticated user)
   */
  userId?: string;
  
  /**
   * Maximum number of tweets (1-100 for v2 API)
   */
  maxResults?: number;
  
  /**
   * Pagination token
   */
  paginationToken?: string;
  
  /**
   * Tweet fields to include
   */
  tweetFields?: string[];
  
  /**
   * User fields to include
   */
  userFields?: string[];
  
  /**
   * Exclude retweets
   */
  excludeRetweets?: boolean;
  
  /**
   * Exclude replies
   */
  excludeReplies?: boolean;
}

/**
 * Twitter API v2 tweet response
 */
export interface TwitterTweetResponse {
  data?: TwitterTweet[];
  includes?: {
    users?: TwitterUser[];
    media?: TwitterMedia[];
  };
  meta?: {
    result_count: number;
    next_token?: string;
    previous_token?: string;
  };
  errors?: Array<{
    title: string;
    detail: string;
    type: string;
  }>;
}

/**
 * Twitter tweet object (API v2)
 */
export interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: Array<{
    type: 'retweeted' | 'quoted' | 'replied_to';
    id: string;
  }>;
  attachments?: {
    media_keys?: string[];
  };
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count?: number;
  };
  entities?: {
    urls?: Array<{
      url: string;
      expanded_url: string;
      display_url: string;
    }>;
    hashtags?: Array<{
      start: number;
      end: number;
      tag: string;
    }>;
    mentions?: Array<{
      start: number;
      end: number;
      username: string;
      id: string;
    }>;
  };
}

/**
 * Twitter user object (API v2)
 */
export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  created_at?: string;
  description?: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
  verified?: boolean;
}

/**
 * Twitter media object (API v2)
 */
export interface TwitterMedia {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
}

