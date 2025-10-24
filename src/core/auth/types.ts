// src/core/auth/types.ts

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  authorizationEndpoint?: string; // Override if not discoverable
  tokenEndpoint?: string;
  scopes: string[];
  redirectUri: string;
  usePKCE: boolean;
}

// OAuth1Config removed - focusing on OAuth2-only implementation

export interface ConnectOptions {
  state?: string; // Custom state
  prompt?: string; // OIDC prompt param
  loginHint?: string;
  extraParams?: Record<string, string>;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  method: 'S256';
  nonce?: string; // OIDC nonce for id_token validation
}
