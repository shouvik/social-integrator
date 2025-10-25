export interface OAuth2Config {
    clientId: string;
    clientSecret: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    scopes: string[];
    redirectUri: string;
    usePKCE: boolean;
}
export interface ConnectOptions {
    state?: string;
    prompt?: string;
    loginHint?: string;
    extraParams?: Record<string, string>;
}
export interface PKCEChallenge {
    codeVerifier: string;
    codeChallenge: string;
    method: 'S256';
    nonce?: string;
}
//# sourceMappingURL=types.d.ts.map