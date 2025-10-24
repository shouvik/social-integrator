// src/connectors/google/GoogleConnector.ts

import { BaseConnector } from '../BaseConnector';
import type { FetchParams } from '../types';
import type { NormalizedItem, ProviderName } from '../../core/normalizer/types';

export interface GoogleFetchParams extends FetchParams {
  service?: 'gmail' | 'calendar';
  query?: string; // Gmail search query (e.g., 'is:unread')
}

export class GoogleConnector extends BaseConnector {
  readonly name: ProviderName = 'google';

  async fetch(userId: string, params?: GoogleFetchParams): Promise<NormalizedItem[]> {
    const service = params?.service ?? 'gmail';

    if (service === 'gmail') {
      return this.fetchGmail(userId, params);
    } else if (service === 'calendar') {
      return this.fetchCalendar(userId, params);
    }

    throw new Error(`Unsupported Google service: ${service}`);
  }

  private async fetchGmail(userId: string, params?: GoogleFetchParams): Promise<NormalizedItem[]> {
    const token = await this.getAccessToken(userId);

    // First, get message IDs
    const listResponse = await this.deps.http.get(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages',
      {
        headers: { Authorization: `Bearer ${token}` },
        query: {
          maxResults: params?.limit ?? 20,
          q: params?.query ?? 'is:unread',
        },
        etagKey: {
          userId,
          provider: 'google',
          resource: `gmail_list_${params?.query ?? 'unread'}`,
        },
      }
    );

    const messageIds = (listResponse.data as any).messages?.map((m: any) => m.id) || [];

    if (messageIds.length === 0) {
      return [];
    }

    // Fetch full messages in parallel (rate-limited by HttpCore)
    const messages = await Promise.all(
      messageIds.slice(0, params?.limit ?? 20).map((id: string) =>
        this.deps.http.get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          query: { format: 'full' },
        })
      )
    );

    const rawMessages = messages.map((r) => r.data);

    // Always normalize (even if cached)
    return this.deps.normalizer.normalize('google', userId, rawMessages);
  }

  private async fetchCalendar(
    userId: string,
    params?: GoogleFetchParams
  ): Promise<NormalizedItem[]> {
    const token = await this.getAccessToken(userId);

    const response = await this.deps.http.get(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        headers: { Authorization: `Bearer ${token}` },
        query: {
          maxResults: params?.limit ?? 20,
          singleEvents: true,
          orderBy: 'startTime',
          timeMin: params?.since?.toISOString() ?? new Date().toISOString(),
        },
        etagKey: { userId, provider: 'google', resource: 'calendar_events' },
      }
    );

    const items = (response.data as any).items || [];

    // Use dedicated calendar mapper for different data structure
    return this.deps.normalizer.normalize('google-calendar', userId, items);
  }

  /**
   * Get Google-specific OAuth parameters for authorization URL
   */
  getConnectOptions(options?: any): any {
    return {
      ...options,
      extraParams: {
        access_type: 'offline', // Required for refresh tokens
        prompt: 'consent', // Force re-consent to get refresh token
        ...options?.extraParams,
      },
    };
  }

  protected getRedirectUri(): string {
    const config = this.deps.auth.getProviderConfig(this.name);
    if (!('redirectUri' in config) || !config.redirectUri) {
      throw new Error(`No redirectUri configured for ${this.name}`);
    }
    return config.redirectUri;
  }
}
