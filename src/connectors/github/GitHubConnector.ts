// src/connectors/github/GitHubConnector.ts

import { BaseConnector } from '../BaseConnector';
import type { FetchParams } from '../types';
import type { NormalizedItem, ProviderName } from '../../core/normalizer/types';

export interface GitHubFetchParams extends FetchParams {
  type?: 'starred' | 'repos';
  page?: number;
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';
}

export class GitHubConnector extends BaseConnector {
  readonly name: ProviderName = 'github';
  
  async fetch(userId: string, params?: GitHubFetchParams): Promise<NormalizedItem[]> {
    const token = await this.getAccessToken(userId);
    const type = params?.type ?? 'starred';
    const page = params?.page ?? 1;
    
    const url = type === 'starred'
      ? 'https://api.github.com/user/starred'
      : 'https://api.github.com/user/repos';
    
    const response = await this.deps.http.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      query: {
        per_page: params?.limit ?? 30,
        page,
        sort: params?.sort ?? 'updated',
        direction: 'desc'
      },
      etagKey: { userId, provider: 'github', resource: `${type}_p${page}` }
    });
    
    // CRITICAL FIX: Always normalize, even on cache hit
    // Cache in HttpCore contains RAW provider data, must always normalize
    const rawData = response.data as any[];
    const normalized = this.deps.normalizer.normalize('github', userId, rawData);
    
    if (response.cached) {
      this.deps.logger.debug('Normalized cached GitHub data', { userId, type });
    }
    
    return normalized;
  }
  
  protected getRedirectUri(): string {
    const uri = process.env.GITHUB_REDIRECT_URI;
    if (!uri) {
      throw new Error('GITHUB_REDIRECT_URI environment variable is required');
    }
    return uri;
  }
}

