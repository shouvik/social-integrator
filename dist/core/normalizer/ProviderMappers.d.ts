import type { NormalizedItem, ProviderName } from './types';
export declare class ProviderMappers {
    private mappers;
    constructor();
    get(provider: ProviderName | string): ((raw: any, userId: string) => NormalizedItem) | undefined;
    private mapGitHub;
    private mapGoogle;
    private mapGoogleCalendar;
    private mapReddit;
    private mapTwitter;
    private mapRSS;
}
//# sourceMappingURL=ProviderMappers.d.ts.map