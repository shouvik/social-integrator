/**
 * Contract test: Google OAuth flow
 *
 * Tests Google-specific OAuth 2.0 requirements:
 * - access_type=offline for refresh tokens
 * - prompt=consent to force re-consent
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ConnectorSDK } from '../../src/sdk';

describe('Google OAuth Flow Contract', () => {
  let sdk: ConnectorSDK;
  const testUserId = 'test-user-123';
  const mockEncryptionKey = '0'.repeat(64);

  beforeEach(async () => {
    sdk = await ConnectorSDK.init({
      tokenStore: {
        backend: 'memory',
        encryption: {
          key: mockEncryptionKey,
          algorithm: 'aes-256-gcm',
        },
      },
      providers: {
        google: {
          clientId: 'test-google-client',
          clientSecret: 'test-google-secret',
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
          scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
          redirectUri: 'http://localhost:3000/callback/google',
          usePKCE: true,
        },
      },
      rateLimits: {
        github: { qps: 10, concurrency: 5 },
        google: { qps: 10, concurrency: 5 },
        reddit: { qps: 1, concurrency: 2 },
        twitter: { qps: 5, concurrency: 3 },
        x: { qps: 5, concurrency: 3 },
        rss: { qps: 1, concurrency: 2 },
      },
      http: {
        retry: {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 1000,
          retryableStatusCodes: [429, 500, 502, 503, 504],
        },
      },
      logging: {
        level: 'error',
      },
    });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should generate authorization URL with access_type=offline and prompt=consent', async () => {
    const authUrl = await sdk.connect('google', testUserId);

    expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(authUrl).toContain('access_type=offline'); // Required for refresh token
    expect(authUrl).toContain('prompt=consent'); // Force re-consent
    expect(authUrl).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly');
  });

  it('should exchange code for tokens with refresh token', async () => {
    // Get auth URL and extract the real state
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.test_access_token',
      refresh_token: 'ya29.test_refresh_token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    });

    // Use the actual state from the auth URL
    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    // Mock Gmail API call
    nock('https://gmail.googleapis.com')
      .get('/gmail/v1/users/me/messages')
      .query({ maxResults: 10, q: 'is:unread' })
      .reply(200, {
        messages: [{ id: '18c123', threadId: '18c123' }],
      });

    nock('https://gmail.googleapis.com')
      .get('/gmail/v1/users/me/messages/18c123')
      .query({ format: 'full' })
      .reply(200, {
        id: '18c123',
        threadId: '18c123',
        snippet: 'Test email content',
        internalDate: '1705316400000',
        payload: {
          headers: [
            { name: 'Subject', value: 'Test Email' },
            { name: 'From', value: 'sender@example.com' },
          ],
        },
        labelIds: ['INBOX', 'UNREAD'],
      });

    const items = await sdk.fetch('google', testUserId, { service: 'gmail', limit: 10 });

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('google');
    expect(items[0].title).toBe('Test Email');
  });

  it('should fetch Google Calendar events', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.calendar_access_token',
      refresh_token: 'ya29.calendar_refresh_token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    // Mock Calendar API call
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true) // Accept any query params
      .reply(200, {
        items: [
          {
            id: 'event-123',
            summary: 'Team Meeting',
            description: 'Weekly sync meeting',
            start: {
              dateTime: '2025-01-20T10:00:00Z',
              timeZone: 'UTC',
            },
            end: {
              dateTime: '2025-01-20T11:00:00Z',
              timeZone: 'UTC',
            },
            htmlLink: 'https://calendar.google.com/event?eid=event-123',
          },
        ],
      });

    const items = await sdk.fetch('google', testUserId, { service: 'calendar', limit: 20 });

    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('google');
    expect(items[0].title).toBe('Team Meeting');
    expect(items[0].metadata?.service).toBe('calendar');
  });

  it('should handle recurring calendar events', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    // Mock recurring event
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query((query) => query.singleEvents === 'true')
      .reply(200, {
        items: [
          {
            id: 'event-recurring-1',
            summary: 'Daily Standup',
            recurrence: ['RRULE:FREQ=DAILY;COUNT=5'],
            start: {
              dateTime: '2025-01-20T09:00:00Z',
              timeZone: 'UTC',
            },
            end: {
              dateTime: '2025-01-20T09:15:00Z',
              timeZone: 'UTC',
            },
            htmlLink: 'https://calendar.google.com/event?eid=event-recurring-1',
          },
        ],
      });

    const items = await sdk.fetch('google', testUserId, { service: 'calendar' });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Daily Standup');
  });

  it('should handle calendar events with all-day dates', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    // Mock all-day event
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true)
      .reply(200, {
        items: [
          {
            id: 'event-allday-1',
            summary: 'Company Holiday',
            start: {
              date: '2025-01-25', // All-day event uses 'date' not 'dateTime'
            },
            end: {
              date: '2025-01-26',
            },
            htmlLink: 'https://calendar.google.com/event?eid=event-allday-1',
          },
        ],
      });

    const items = await sdk.fetch('google', testUserId, { service: 'calendar' });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Company Holiday');
  });

  it('should handle empty calendar response', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true)
      .reply(200, {
        items: [],
      });

    const items = await sdk.fetch('google', testUserId, { service: 'calendar' });

    expect(items).toHaveLength(0);
  });

  it('should handle calendar API errors', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true)
      .reply(403, {
        error: {
          code: 403,
          message: 'Insufficient Permission',
          errors: [
            {
              domain: 'global',
              reason: 'insufficientPermissions',
              message: 'Insufficient Permission',
            },
          ],
        },
      });

    await expect(sdk.fetch('google', testUserId, { service: 'calendar' })).rejects.toThrow();
  });

  it('should use google-calendar mapper for calendar events', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true)
      .reply(200, {
        items: [
          {
            id: 'cal-event',
            summary: 'Test Calendar Event',
            start: { dateTime: '2025-01-22T14:00:00Z' },
            end: { dateTime: '2025-01-22T15:00:00Z' },
            htmlLink: 'https://calendar.google.com/event?eid=cal-event',
          },
        ],
      });

    const items = await sdk.fetch('google', testUserId, { service: 'calendar' });

    // Verify it uses google source with calendar service metadata
    expect(items[0].source).toBe('google');
    expect(items[0].metadata?.service).toBe('calendar');
  });

  it('should throw error for unsupported Google service', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    // Test unsupported service
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(sdk.fetch('google', testUserId, { service: 'drive' as any })).rejects.toThrow(
      'Unsupported Google service: drive'
    );
  });

  it('should use default limit when not specified for Gmail', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    nock('https://gmail.googleapis.com')
      .get('/gmail/v1/users/me/messages')
      .query((query) => query.maxResults === '20') // Default limit
      .reply(200, { messages: [] });

    const items = await sdk.fetch('google', testUserId, { service: 'gmail' });
    expect(items).toHaveLength(0);
  });

  it('should use default query when not specified for Gmail', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    nock('https://gmail.googleapis.com')
      .get('/gmail/v1/users/me/messages')
      .query((query) => query.q === 'is:unread') // Default query
      .reply(200, { messages: [] });

    const items = await sdk.fetch('google', testUserId, { service: 'gmail' });
    expect(items).toHaveLength(0);
  });

  it('should use default service (gmail) when not specified', async () => {
    const authUrl = await sdk.connect('google', testUserId);
    const url = new URL(authUrl);
    const actualState = url.searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'ya29.token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const callbackParams = new URLSearchParams({ code: 'test_code', state: actualState });
    await sdk.handleCallback('google', testUserId, callbackParams);

    nock('https://gmail.googleapis.com')
      .get('/gmail/v1/users/me/messages')
      .query(true)
      .reply(200, { messages: [] });

    // No service specified - should default to gmail
    const items = await sdk.fetch('google', testUserId);
    expect(items).toHaveLength(0);
  });
});
