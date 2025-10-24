// src/core/normalizer/ProviderMappers.ts

import { v4 as uuidv4 } from 'uuid';
import type { NormalizedItem, ProviderName } from './types';

export class ProviderMappers {
  private mappers: Map<ProviderName, (raw: any, userId: string) => NormalizedItem>;
  
  constructor() {
    this.mappers = new Map([
      ['github', this.mapGitHub],
      ['google', this.mapGoogle],
      ['reddit', this.mapReddit],
      ['twitter', this.mapTwitter],
      ['x', this.mapTwitter], // Alias for backward compatibility
      ['rss', this.mapRSS]
    ]);
  }
  
  get(provider: ProviderName) {
    return this.mappers.get(provider);
  }
  
  // GitHub mapper (starred repos)
  private mapGitHub(raw: any, userId: string): NormalizedItem {
    return {
      id: uuidv4(),
      source: 'github',
      externalId: String(raw.id),
      userId,
      title: raw.name || undefined,
      bodyText: raw.description || undefined,  // Convert null to undefined
      url: raw.html_url,
      author: raw.owner?.login,
      publishedAt: raw.created_at ? new Date(raw.created_at).toISOString() : undefined, // v1.1 ISO 8601
      metadata: {
        stars: raw.stargazers_count,
        language: raw.language,
        topics: raw.topics
      }
    };
  }
  
  // Google Gmail mapper
  private mapGoogle(raw: any, userId: string): NormalizedItem {
    const headers = raw.payload?.headers || [];
    const getHeader = (name: string) => 
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;
    
    return {
      id: uuidv4(),
      source: 'google',
      externalId: raw.id,
      userId,
      title: getHeader('Subject'),
      bodyText: raw.snippet,
      url: `https://mail.google.com/mail/u/0/#inbox/${raw.id}`,
      author: getHeader('From'),
      publishedAt: raw.internalDate 
        ? new Date(parseInt(raw.internalDate)).toISOString() // v1.1 ISO 8601
        : undefined,
      metadata: {
        labelIds: raw.labelIds,
        threadId: raw.threadId
      }
    };
  }
  
  // Reddit mapper
  private mapReddit(raw: any, userId: string): NormalizedItem {
    const data = raw.data || raw;
    return {
      id: uuidv4(),
      source: 'reddit',
      externalId: data.id,
      userId,
      title: data.title,
      bodyText: data.selftext || data.body,
      url: data.url || `https://reddit.com${data.permalink}`,
      author: data.author,
      publishedAt: data.created_utc 
        ? new Date(data.created_utc * 1000).toISOString() // v1.1 ISO 8601
        : undefined,
      metadata: {
        subreddit: data.subreddit,
        score: data.score,
        numComments: data.num_comments
      }
    };
  }
  
  // Twitter/X mapper (API v2 format)
  private mapTwitter(raw: any, userId: string): NormalizedItem {
    // Support both v1.1 and v2 API formats
    const id = raw.id_str || raw.id;
    const text = raw.text || raw.full_text;
    const author = raw.user?.screen_name || raw.author_id || 'unknown';
    const metrics = raw.public_metrics || {};
    
    return {
      id: uuidv4(),
      source: 'twitter',
      externalId: String(id),
      userId,
      title: undefined,
      bodyText: text,
      url: `https://twitter.com/i/web/status/${id}`,
      author,
      publishedAt: raw.created_at 
        ? new Date(raw.created_at).toISOString() // v1.1 ISO 8601
        : undefined,
      metadata: {
        retweets: metrics.retweet_count ?? raw.retweet_count,
        likes: metrics.like_count ?? raw.favorite_count,
        replies: metrics.reply_count,
        quotes: metrics.quote_count,
        hashtags: raw.entities?.hashtags?.map((h: any) => h.tag || h.text)
      }
    };
  }
  
  // RSS mapper
  private mapRSS(raw: any, userId: string): NormalizedItem {
    return {
      id: uuidv4(),
      source: 'rss',
      externalId: raw.guid || raw.link,
      userId,
      title: raw.title,
      bodyText: raw.contentSnippet || raw.content,
      url: raw.link,
      author: raw.creator || raw.author,
      publishedAt: raw.pubDate 
        ? new Date(raw.pubDate).toISOString() // v1.1 ISO 8601
        : undefined,
      metadata: {
        categories: raw.categories,
        feedTitle: raw.feedTitle
      }
    };
  }
}

