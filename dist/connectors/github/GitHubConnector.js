"use strict";
// src/connectors/github/GitHubConnector.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubConnector = void 0;
const BaseConnector_1 = require("../BaseConnector");
class GitHubConnector extends BaseConnector_1.BaseConnector {
    name = 'github';
    async fetch(userId, params) {
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
                'X-GitHub-Api-Version': '2022-11-28',
            },
            query: {
                per_page: params?.limit ?? 30,
                page,
                sort: params?.sort ?? 'updated',
                direction: 'desc',
            },
            etagKey: { userId, provider: 'github', resource: `${type}_p${page}` },
        });
        // CRITICAL FIX: Always normalize, even on cache hit
        // Cache in HttpCore contains RAW provider data, must always normalize
        const rawData = response.data;
        const normalized = this.deps.normalizer.normalize('github', userId, rawData);
        if (response.cached) {
            this.deps.logger.debug('Normalized cached GitHub data', { userId, type });
        }
        return normalized;
    }
    getRedirectUri() {
        const config = this.deps.auth.getProviderConfig(this.name);
        if (!('redirectUri' in config) || !config.redirectUri) {
            throw new Error(`No redirectUri configured for ${this.name}`);
        }
        return config.redirectUri;
    }
}
exports.GitHubConnector = GitHubConnector;
//# sourceMappingURL=GitHubConnector.js.map