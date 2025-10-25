"use strict";
// src/connectors/google/GoogleConnector.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleConnector = void 0;
const BaseConnector_1 = require("../BaseConnector");
class GoogleConnector extends BaseConnector_1.BaseConnector {
    name = 'google';
    async fetch(userId, params) {
        const service = params?.service ?? 'gmail';
        if (service === 'gmail') {
            return this.fetchGmail(userId, params);
        }
        else if (service === 'calendar') {
            return this.fetchCalendar(userId, params);
        }
        throw new Error(`Unsupported Google service: ${service}`);
    }
    async fetchGmail(userId, params) {
        const token = await this.getAccessToken(userId);
        // First, get message IDs
        const listResponse = await this.deps.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
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
        });
        const messageIds = listResponse.data.messages?.map((m) => m.id) || [];
        if (messageIds.length === 0) {
            return [];
        }
        // Fetch full messages in parallel (rate-limited by HttpCore)
        const messages = await Promise.all(messageIds.slice(0, params?.limit ?? 20).map((id) => this.deps.http.get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
            query: { format: 'full' },
        })));
        const rawMessages = messages.map((r) => r.data);
        // Always normalize (even if cached)
        return this.deps.normalizer.normalize('google', userId, rawMessages);
    }
    async fetchCalendar(userId, params) {
        const token = await this.getAccessToken(userId);
        const response = await this.deps.http.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            headers: { Authorization: `Bearer ${token}` },
            query: {
                maxResults: params?.limit ?? 20,
                singleEvents: true,
                orderBy: 'startTime',
                timeMin: params?.since?.toISOString() ?? new Date().toISOString(),
            },
            etagKey: { userId, provider: 'google', resource: 'calendar_events' },
        });
        const items = response.data.items || [];
        // Use dedicated calendar mapper for different data structure
        return this.deps.normalizer.normalize('google-calendar', userId, items);
    }
    /**
     * Get Google-specific OAuth parameters for authorization URL
     */
    getConnectOptions(options) {
        return {
            ...options,
            extraParams: {
                access_type: 'offline', // Required for refresh tokens
                prompt: 'consent', // Force re-consent to get refresh token
                ...options?.extraParams,
            },
        };
    }
    getRedirectUri() {
        const config = this.deps.auth.getProviderConfig(this.name);
        if (!('redirectUri' in config) || !config.redirectUri) {
            throw new Error(`No redirectUri configured for ${this.name}`);
        }
        return config.redirectUri;
    }
}
exports.GoogleConnector = GoogleConnector;
//# sourceMappingURL=GoogleConnector.js.map