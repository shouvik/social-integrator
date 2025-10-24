// tests/unit/Normalizer.test.ts

import { describe, it, expect } from 'vitest';
import { Normalizer } from '../../src/core/normalizer/Normalizer';

describe('Normalizer', () => {
  const normalizer = new Normalizer();
  
  it('should normalize GitHub data with ISO 8601 timestamps', () => {
    const rawGitHub = [{
      id: 123456,
      name: 'awesome-repo',
      description: 'An awesome repository',
      html_url: 'https://github.com/user/awesome-repo',
      owner: { login: 'testuser' },
      created_at: '2025-01-01T00:00:00Z',
      stargazers_count: 1000,
      language: 'TypeScript',
      topics: ['sdk', 'oauth']
    }];
    
    const normalized = normalizer.normalize('github', 'user123', rawGitHub);
    
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      source: 'github',
      externalId: '123456',  // String, not number
      userId: 'user123',
      title: 'awesome-repo',
      bodyText: 'An awesome repository',
      url: 'https://github.com/user/awesome-repo',
      author: 'testuser',
      publishedAt: '2025-01-01T00:00:00.000Z'  // ISO 8601 string
    });
    
    expect(normalized[0].id).toMatch(/^[0-9a-f-]+$/i);  // UUID
    expect(normalized[0].metadata).toEqual({
      stars: 1000,
      language: 'TypeScript',
      topics: ['sdk', 'oauth']
    });
  });
  
  it('should normalize Google Gmail data', () => {
    const rawGmail = [{
      id: 'msg123',
      threadId: 'thread456',
      labelIds: ['INBOX', 'UNREAD'],
      snippet: 'Email preview text...',
      payload: {
        headers: [
          { name: 'Subject', value: 'Test Email' },
          { name: 'From', value: 'sender@example.com' }
        ]
      },
      internalDate: '1704067200000'  // 2024-01-01 00:00:00 UTC
    }];
    
    const normalized = normalizer.normalize('google', 'user456', rawGmail);
    
    expect(normalized[0]).toMatchObject({
      source: 'google',
      externalId: 'msg123',
      userId: 'user456',
      title: 'Test Email',
      bodyText: 'Email preview text...',
      author: 'sender@example.com',
      publishedAt: '2024-01-01T00:00:00.000Z'
    });
    
    expect(normalized[0].metadata).toEqual({
      labelIds: ['INBOX', 'UNREAD'],
      threadId: 'thread456'
    });
  });
  
  it('should normalize Reddit data with Unix timestamps', () => {
    const rawReddit = [{
      data: {
        id: 'abc123',
        title: 'Great Post',
        selftext: 'Post content here',
        author: 'reddituser',
        subreddit: 'programming',
        url: 'https://reddit.com/r/programming/comments/abc123',
        permalink: '/r/programming/comments/abc123',
        created_utc: 1704067200,  // Unix timestamp
        score: 420,
        num_comments: 69
      }
    }];
    
    const normalized = normalizer.normalize('reddit', 'user789', rawReddit);
    
    expect(normalized[0]).toMatchObject({
      source: 'reddit',
      externalId: 'abc123',
      userId: 'user789',
      title: 'Great Post',
      bodyText: 'Post content here',
      author: 'reddituser',
      publishedAt: '2024-01-01T00:00:00.000Z'
    });
    
    expect(normalized[0].metadata).toEqual({
      subreddit: 'programming',
      score: 420,
      numComments: 69
    });
  });
  
  it('should normalize Twitter/X data', () => {
    const rawTwitter = [{
      id_str: '123456789',
      text: 'Great tweet!',
      created_at: 'Mon Jan 01 00:00:00 +0000 2024',
      user: {
        screen_name: 'twitteruser'
      },
      retweet_count: 10,
      favorite_count: 25,
      entities: {
        hashtags: [{ text: 'tech' }]
      }
    }];
    
    const normalized = normalizer.normalize('twitter', 'userX', rawTwitter);
    
    expect(normalized[0]).toMatchObject({
      source: 'twitter',
      externalId: '123456789',
      userId: 'userX',
      bodyText: 'Great tweet!',
      author: 'twitteruser',
      publishedAt: '2024-01-01T00:00:00.000Z'
    });
    
    expect(normalized[0].metadata).toMatchObject({
      retweets: 10,
      likes: 25
    });
  });
  
  it('should normalize RSS feed data', () => {
    const rawRSS = [{
      guid: 'https://example.com/post/123',
      title: 'Blog Post Title',
      link: 'https://example.com/post/123',
      contentSnippet: 'Post summary...',
      creator: 'Author Name',
      pubDate: '2024-01-01T00:00:00.000Z',
      categories: ['Technology', 'Programming'],
      feedTitle: 'Tech Blog'
    }];
    
    const normalized = normalizer.normalize('rss', 'userRSS', rawRSS);
    
    expect(normalized[0]).toMatchObject({
      source: 'rss',
      externalId: 'https://example.com/post/123',
      userId: 'userRSS',
      title: 'Blog Post Title',
      bodyText: 'Post summary...',
      url: 'https://example.com/post/123',
      author: 'Author Name',
      publishedAt: '2024-01-01T00:00:00.000Z'
    });
    
    expect(normalized[0].metadata).toEqual({
      categories: ['Technology', 'Programming'],
      feedTitle: 'Tech Blog'
    });
  });
  
  it('should throw error for unknown provider', () => {
    const data = [{ id: 123, name: 'test' }];
    
    expect(() => {
      normalizer.normalize('unknown' as any, 'user123', data);
    }).toThrow(/No mapper found for provider/);
  });
  
  it('should handle null/undefined values gracefully', () => {
    const rawWithNulls = [{
      id: 789,
      name: 'repo',
      description: null,  // Null description
      html_url: 'https://github.com/user/repo',
      owner: { login: 'user' },
      created_at: null,  // Null timestamp
      stargazers_count: 0
    }];
    
    const normalized = normalizer.normalize('github', 'user', rawWithNulls);
    
    expect(normalized[0].bodyText).toBeUndefined();  // Null converted to undefined
    expect(normalized[0].publishedAt).toBeUndefined();
  });
});

