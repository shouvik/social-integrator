import { BaseConnector } from '../BaseConnector';
import type { FetchParams } from '../types';
import type { NormalizedItem, ProviderName } from '../../core/normalizer/types';
export interface GoogleFetchParams extends FetchParams {
    service?: 'gmail' | 'calendar';
    query?: string;
}
export declare class GoogleConnector extends BaseConnector {
    readonly name: ProviderName;
    fetch(userId: string, params?: GoogleFetchParams): Promise<NormalizedItem[]>;
    private fetchGmail;
    private fetchCalendar;
    /**
     * Get Google-specific OAuth parameters for authorization URL
     */
    getConnectOptions(options?: any): any;
    protected getRedirectUri(): string;
}
//# sourceMappingURL=GoogleConnector.d.ts.map