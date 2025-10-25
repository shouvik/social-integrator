import { BaseConnector } from '../BaseConnector';
import type { FetchParams } from '../types';
import type { NormalizedItem, ProviderName } from '../../core/normalizer/types';
export interface GitHubFetchParams extends FetchParams {
    type?: 'starred' | 'repos';
    page?: number;
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
}
export declare class GitHubConnector extends BaseConnector {
    readonly name: ProviderName;
    fetch(userId: string, params?: GitHubFetchParams): Promise<NormalizedItem[]>;
    protected getRedirectUri(): string;
}
//# sourceMappingURL=GitHubConnector.d.ts.map